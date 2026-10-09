import {
  FormProvider,
  getFormProps,
  getInputProps,
  useForm,
} from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod/v4";
import { useMemo } from "react";
import { Form } from "react-router";

import type { Route } from "./+types/dinners_.$dinnerId";

import { CheckboxField, ErrorList } from "~/components/forms";
import { RouteErrorContent } from "~/components/route-error-content";
import { BackLink, PageContainer } from "~/components/section";
import { Button } from "~/components/ui/button";
import { requestLoggerContext } from "~/features/auth/middleware.server";
import {
  EventFactList,
  EventStory,
} from "~/features/events/components/event-view";
import { isPastEvent } from "~/features/events/event-status";
import { toEventDetailModel } from "~/features/events/view-models";
import { getViewForField, type FieldDescriptor } from "~/features/forms/fields";
import { HONEYPOT_RETRY_MESSAGE } from "~/features/forms/honeypot";
import { HoneypotField } from "~/features/forms/honeypot-field";
import { checkHoneypot } from "~/features/forms/honeypot.server";
import { normalizeSubmissionValues } from "~/features/forms/normalize-submission";
import { parseStoredFormSchemaOrLog } from "~/features/forms/serialization.server";
import { EventGallerySection } from "~/features/gallery/components/event-gallery-section";
import { loadEventGallerySection } from "~/features/gallery/event-section.server";
import { buildSignupSchema } from "~/features/signup-form/build-schema";
import { PrivacyConsentLabel } from "~/features/signup-form/privacy-consent-label";
import { metaText, useText } from "~/features/site-content/site-text";
import { getServerText } from "~/features/site-content/site-texts.server";
import { cn } from "~/lib/utils";
import { getEventWithCurrentFormVersion } from "~/models/event.server";
import {
  createFormSubmission,
  FormVersionChangedError,
} from "~/models/form-submission.server";
import { getClientIPAddress, requireFound } from "~/shared/http.server";
import { getImageUrl } from "~/shared/image";
import { withOpenGraphUrls } from "~/shared/meta";
import { getImageConfig } from "~/shared/root-data";
import { redirectWithToast } from "~/utils/toast.server";

export async function loader({ params }: Route.LoaderArgs) {
  const { dinnerId } = params;

  const { event, version } = requireFound(
    await getEventWithCurrentFormVersion(dinnerId),
  );

  // the gallery belongs to evenings that already happened; upcoming dinners
  // pay nothing for it
  const gallery = isPastEvent(event.date, new Date())
    ? await loadEventGallerySection(event.id)
    : null;

  return {
    event: toEventDetailModel(event),
    formFields: parseStoredFormSchemaOrLog(version),
    formVersionId: version.id,
    gallery,
  };
}

const FORM_CHANGED_ERROR =
  "The signup form was updated while you were filling it out. Please review your answers and submit again.";

// shared with the spam-trap response, which must be indistinguishable from a
// real success
async function redirectWithSignupSuccess() {
  return redirectWithToast("/dinners", {
    title: await getServerText("dinner.signupSuccessTitle"),
    description: await getServerText("dinner.signupSuccessBody"),
    type: "success",
  });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { dinnerId } = params;
  const logger = context.get(requestLoggerContext);

  const { event: dinner, version } = requireFound(
    await getEventWithCurrentFormVersion(dinnerId),
  );

  if (isPastEvent(dinner.date, new Date())) {
    throw new Response("Forbidden", { status: 403 });
  }

  const formFields = parseStoredFormSchemaOrLog(version);

  if (!formFields) {
    throw new Response("Internal Server Error", { status: 500 });
  }

  const schema = buildSignupSchema(formFields);
  const formData = await request.formData();

  // Answered with the success path's toast redirect: a caught bot must not
  // learn it was caught, so nothing is validated or stored.
  const honeypot = checkHoneypot(formData);
  if (honeypot.outcome === "trapped") {
    logger.warn(
      {
        ip: getClientIPAddress(request),
        dinner: dinner.id,
        reason: honeypot.reason,
      },
      "Blocked dinner signup caught by the spam trap",
    );

    return redirectWithSignupSuccess();
  }

  const submission = parseWithZod(formData, { schema });

  if (honeypot.outcome === "unverified") {
    logger.info(
      {
        ip: getClientIPAddress(request),
        dinner: dinner.id,
        reason: honeypot.reason,
      },
      "Rejected dinner signup with an unverifiable spam-trap stamp",
    );

    return submission.reply({ formErrors: [HONEYPOT_RETRY_MESSAGE] });
  }

  if (formData.get("formVersionId") !== version.id) {
    logger.info(
      {
        dinner: dinner.id,
        submittedVersion: formData.get("formVersionId"),
        currentVersion: version.id,
      },
      "Dinner signup submitted against an outdated form version",
    );

    return submission.reply({ formErrors: [FORM_CHANGED_ERROR] });
  }

  if (submission.status !== "success" || !submission.value) {
    logger.info(
      {
        ip: getClientIPAddress(request),
        dinner: dinner.id,
        email:
          submission.payload["email"]?.toString() ?? "unknown@no-domain.com",
        reason: submission.status === "error" ? submission.error : null,
      },
      "Failed submission for dinner signup",
    );

    return submission.reply();
  }

  const { acceptedPrivacy: _acceptedPrivacy, ...values } = submission.value;
  const answers = normalizeSubmissionValues(formFields, values);

  const email =
    typeof values.email === "string" ? values.email : "unknown@no-domain.com";

  try {
    await createFormSubmission({
      formVersionId: version.id,
      answers,
      expectedVersionUpdatedAt: version.updatedAt,
    });
  } catch (reason) {
    if (reason instanceof FormVersionChangedError) {
      logger.warn(
        {
          dinner: dinner.id,
          formVersion: version.id,
        },
        "Dinner signup raced an in-place form update",
      );

      return submission.reply({ formErrors: [FORM_CHANGED_ERROR] });
    }

    logger.error(
      {
        ip: getClientIPAddress(request),
        dinner: dinner.id,
        email,
        error: reason,
      },
      "Failed to persist dinner signup",
    );

    return submission.reply({
      formErrors: ["Your signup could not be saved. Please try again."],
    });
  }

  logger.info(
    {
      ip: getClientIPAddress(request),
      dinner: dinner.id,
      email,
    },
    "Successful submission for dinner signup",
  );

  return redirectWithSignupSuccess();
}

export const meta: Route.MetaFunction = ({ loaderData, matches, location }) => {
  const metaTags = [
    {
      title: metaText(matches, "dinner.metaTitleFallback"),
    },
  ];

  if (!loaderData) return metaTags;

  const { event } = loaderData;
  const tags = [
    { title: metaText(matches, "dinner.metaTitle", { title: event.title }) },
    { property: "og:title", content: event.title },
    { property: "og:type", content: "website" },
  ];

  return withOpenGraphUrls(tags, {
    matches,
    imagePath: event.image
      ? getImageUrl(event.image, getImageConfig(matches))
      : undefined,
    pagePath: location.pathname,
  });
};

export default function DinnerPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { event, formFields, formVersionId, gallery } = loaderData;
  const t = useText();

  const eventIsPast = isPastEvent(new Date(event.date), new Date());
  const signupFields = eventIsPast ? null : formFields;
  const gridClasses = cn(
    "grid items-start gap-8",
    !eventIsPast && "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]",
  );

  return (
    <PageContainer className="grow pt-7 pb-20">
      <BackLink to="/dinners" className="mb-6">
        {t("dinner.backLink")}
      </BackLink>

      <div className={gridClasses}>
        <EventStory event={event} />

        {signupFields ? (
          // no fill — a single rule separates the sidebar from the story,
          // stacking above it on mobile and beside it from lg up
          <aside
            id="sign-up"
            className="flex flex-col gap-4 border-t pt-8 lg:sticky lg:top-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
          >
            <EventFactList event={event} />

            <>
              <div aria-hidden className="bg-border h-px" />

              <h2 className="text-xl font-light">
                {t("dinner.signupHeading")}
              </h2>

              <SignupForm
                key={JSON.stringify(signupFields)}
                formFields={signupFields}
                formVersionId={formVersionId}
                lastResult={actionData}
              />
            </>
          </aside>
        ) : null}
      </div>

      {gallery ? <EventGallerySection {...gallery} /> : null}
    </PageContainer>
  );
}

function SignupForm({
  formFields,
  formVersionId,
  lastResult,
}: {
  formFields: FieldDescriptor[];
  formVersionId: string;
  lastResult: Route.ComponentProps["actionData"];
}) {
  const t = useText();
  const schema = useMemo(() => buildSignupSchema(formFields), [formFields]);

  const [form, fields] = useForm({
    lastResult,
    shouldValidate: "onBlur",
    constraint: getZodConstraint(schema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
  });

  return (
    <FormProvider context={form.context}>
      <Form
        method="post"
        {...getFormProps(form)}
        className="flex flex-col gap-3"
      >
        <button type="submit" hidden />

        <input type="hidden" name="formVersionId" value={formVersionId} />

        <HoneypotField />

        {formFields.map((descriptor) => {
          const FieldView = getViewForField(descriptor);

          return (
            <FieldView
              key={descriptor.data.name}
              fieldConfig={descriptor}
              fieldMetadata={fields[descriptor.data.name]}
            />
          );
        })}

        <CheckboxField
          labelProps={{ children: <PrivacyConsentLabel /> }}
          buttonProps={{
            ...getInputProps(fields.acceptedPrivacy, {
              type: "checkbox",
            }),
          }}
          errors={fields.acceptedPrivacy.errors}
        />

        <ErrorList id={form.errorId} errors={form.errors} />

        <Button type="submit" size="lg" className="w-full">
          {t("dinner.signupButton")}
        </Button>

        <p className="text-muted-foreground text-center text-xs leading-normal">
          {t("dinner.signupNote")}
        </p>
      </Form>
    </FormProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorContent error={error} />;
}
