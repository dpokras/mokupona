import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { Logger } from "pino";
import { renderToPipeableStream } from "react-dom/server";
import type {
  EntryContext,
  HandleErrorFunction,
  RouterContextProvider,
  ServerInstrumentation,
} from "react-router";
import { isRouteErrorResponse, ServerRouter } from "react-router";

import { requestLoggerContext } from "~/features/auth/middleware.server";
import { describeCompletedRequest } from "~/logger/request-log.server";
import { logger } from "~/logger.server";
import { NonceProvider } from "~/shared/nonce";
import {
  contentSecurityPolicy,
  createNonce,
} from "~/shared/security-headers.server";

export const streamTimeout = 5000;

export const handleError: HandleErrorFunction = (
  error,
  { request, context },
) => {
  if (request.signal.aborted) return;

  const log = context?.get(requestLoggerContext) ?? logger;

  log.error(
    {
      error:
        isRouteErrorResponse(error) && "error" in error && error.error
          ? error.error
          : error,
      path: new URL(request.url).pathname,
    },
    "Unhandled error while handling a request",
  );
};

export const instrumentations: ServerInstrumentation[] = [
  {
    handler(handler) {
      handler.instrument({
        async request(callHandler, info) {
          const startedAt = performance.now();
          const result = await callHandler();

          const entry = describeCompletedRequest({
            method: info.request.method,
            pathname: new URL(info.request.url).pathname,
            pattern: result.meta?.pattern,
            statusCode: result.statusCode,
            failed: result.status === "error",
            shellMs: Math.round(performance.now() - startedAt),
          });
          if (!entry) return;

          const log = info.context?.get(requestLoggerContext) ?? logger;
          log[entry.level](entry.bindings, "Request completed");
        },
      });
    },
  },
];

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const readyEvent = isbot(request.headers.get("user-agent"))
    ? "onAllReady"
    : "onShellReady";

  return streamDocument(
    request,
    responseStatusCode,
    responseHeaders,
    reactRouterContext,
    readyEvent,
    loadContext.get(requestLoggerContext),
  );
}

function streamDocument(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  readyEvent: "onAllReady" | "onShellReady",
  log: Logger,
) {
  const path = new URL(request.url).pathname;
  const nonce = createNonce();
  const csp = contentSecurityPolicy(nonce);
  if (csp) responseHeaders.set("Content-Security-Policy", csp);

  return new Promise((resolve, reject) => {
    let timeout: NodeJS.Timeout | undefined;
    let rendered = false;
    const renderDone = () => {
      rendered = true;
      clearTimeout(timeout);
    };

    const sendShell = (pipe: (to: PassThrough) => void) => {
      const body = new PassThrough();

      responseHeaders.set("Content-Type", "text/html");

      resolve(
        new Response(createReadableStreamFromReadable(body), {
          headers: responseHeaders,
          status: responseStatusCode,
        }),
      );

      pipe(body);
    };

    const { abort, pipe } = renderToPipeableStream(
      <NonceProvider value={nonce}>
        <ServerRouter
          context={reactRouterContext}
          url={request.url}
          nonce={nonce}
        />
      </NonceProvider>,
      {
        nonce,
        onShellReady() {
          if (readyEvent === "onShellReady") sendShell(pipe);
        },
        onAllReady() {
          renderDone();
          if (readyEvent === "onAllReady") sendShell(pipe);
        },
        onShellError(error: unknown) {
          renderDone();
          log.warn({ path }, "Document shell render failed");
          reject(error);
        },
        onError(error: unknown) {
          log.warn({ error, path }, "Error while rendering the document");
          responseStatusCode = 500;
        },
      },
    );

    if (!rendered) {
      timeout = setTimeout(() => {
        log.warn({ path }, "Document render exceeded the stream timeout");
        abort();
      }, streamTimeout + 1000);
    }
  });
}
