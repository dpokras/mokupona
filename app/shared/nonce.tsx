import { createContext, useContext } from "react";

const NonceContext = createContext("");

export const NonceProvider = NonceContext.Provider;

/** The per-response CSP nonce on the server; empty in the browser. */
export function useNonce() {
  return useContext(NonceContext);
}
