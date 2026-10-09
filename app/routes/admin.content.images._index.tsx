import type { SubmissionResult } from "@conform-to/react";
import { ArrowLeftIcon, ImageIcon, Trash2Icon } from "lucide-react";
import { Link, useFetcher } from "react-router";

import type { Route } from "./+types/admin.content.images._index";

import { AdminPageHeader } from "~/components/admin-ui";
import { Field, fileFieldClassName } from "~/components/forms";
import { OptimizedImage } from "~/components/optimized-image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  IMAGE_SLOT_KEYS,
  IMAGE_SLOTS,
  type ImageSlot,
  type ImageSlotKey,
} from "~/features/site-content/image-slots";
import { loadSiteImages } from "~/features/site-content/site-images.server";
import { cn } from "~/lib/utils";
import type { ImageMetadata } from "~/models/image.server";
import { VALID_IMAGE_TYPES, type ImageDisplaySource } from "~/shared/image";

export async function loader() {
  const images = await loadSiteImages();

  return {
    slots: IMAGE_SLOT_KEYS.map((key) => ({ key, image: images[key] })),
  };
}

export const meta: Route.MetaFunction = () => [{ title: "Admin - Images" }];

export default function AdminContentImagesPage({
  loaderData,
}: Route.ComponentProps) {
  return (
    <div className="animate-page-in">
      <Link
        to="/admin/content"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" />
        site content
      </Link>

      <AdminPageHeader
        eyebrow="images"
        title="Images"
        subtitle="Pictures used on pages other than dinners. Upload a new one to replace what is there."
      />

      <div className="flex flex-col gap-4">
        {loaderData.slots.map(({ key, image }) => (
          <ImageSlotCard key={key} slotKey={key} image={image} />
        ))}
      </div>
    </div>
  );
}

function recommendedSize({ width, height }: ImageSlot) {
  const shape =
    width > height ? "landscape" : width < height ? "portrait" : "square";
  return `Best as a ${shape} image of ${width} × ${height} pixels or more. Other shapes are cropped to fit.`;
}

function ImageSlotCard({
  slotKey,
  image,
}: {
  slotKey: ImageSlotKey;
  image: ImageMetadata | null;
}) {
  const slot: ImageSlot = IMAGE_SLOTS[slotKey];
  const upload = useFetcher<SubmissionResult>();
  const uploading = upload.state !== "idle";
  const uploadErrors = upload.data?.error?.image;

  return (
    <Card className="grid gap-5 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-5">
      <SlotPreview slot={slot} image={image ?? slot.fallback} />

      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{slot.label}</h2>
            <Badge variant={image ? "info" : "secondary"} pill>
              {image
                ? "uploaded"
                : slot.fallback
                  ? "using the default image"
                  : "not set"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{slot.help}</p>
          <p className="text-muted-foreground mt-2 text-xs font-semibold">
            {recommendedSize(slot)}
          </p>
        </div>

        <upload.Form
          key={image?.id ?? "none"}
          method="POST"
          encType="multipart/form-data"
          action={`/admin/content/images/${slotKey}`}
          className="flex flex-col gap-3"
        >
          <Field
            labelProps={{ children: image ? "Replace it" : "Upload an image" }}
            inputProps={{
              name: "image",
              type: "file",
              required: true,
              tabIndex: 0,
              accept: VALID_IMAGE_TYPES.join(","),
              className: cn(
                fileFieldClassName,
                uploadErrors?.length && "border-destructive-light/50",
              ),
            }}
            description="JPEG, PNG or WebP, up to 3 MB."
            errors={uploadErrors}
          />
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </upload.Form>

        {image ? <RemoveSlotImage slotKey={slotKey} slot={slot} /> : null}
      </div>
    </Card>
  );
}

function SlotPreview({
  slot,
  image,
}: {
  slot: ImageSlot;
  image: ImageDisplaySource | null;
}) {
  if (!image) {
    return (
      <div
        className="border-foreground/20 text-muted-foreground flex flex-col items-center justify-center gap-2 border border-dashed text-sm"
        style={{ aspectRatio: `${slot.width} / ${slot.height}` }}
      >
        <ImageIcon className="size-6" />
        No image yet
      </div>
    );
  }

  return (
    <OptimizedImage
      image={image}
      alt={slot.label}
      width={slot.width}
      height={slot.height}
      sizes="(min-width: 768px) 360px, 100vw"
    />
  );
}

function RemoveSlotImage({
  slotKey,
  slot,
}: {
  slotKey: ImageSlotKey;
  slot: ImageSlot;
}) {
  const remove = useFetcher();
  const removing = remove.state !== "idle";

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="destructive-outline"
            size="sm"
            className="self-start"
          />
        }
      >
        <Trash2Icon className="size-4" />
        Remove
      </DialogTrigger>

      <DialogContent
        showClose={false}
        overlayClassName="bg-background/75"
        className="gap-4 p-4 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
      >
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-xl font-semibold">
            Remove the {slot.label.toLowerCase()}?
          </DialogTitle>
          <DialogDescription>
            {slot.fallback
              ? "The site goes back to the default image."
              : "The page shows no photo until you upload a new one."}{" "}
            The uploaded file is deleted.
          </DialogDescription>
        </div>

        <remove.Form
          method="POST"
          action={`/admin/content/images/${slotKey}/remove`}
          className="flex justify-end gap-3"
        >
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            variant="destructive-outline"
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove image"}
          </Button>
        </remove.Form>
      </DialogContent>
    </Dialog>
  );
}
