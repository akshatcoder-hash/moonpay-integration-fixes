import { MoonPayProvider, MoonPaySellWidget } from "@moonpay/moonpay-react";
import type { ComponentProps } from "react";
import { handleGetSignature } from "./client.js";

const onUrlSignatureRequested: NonNullable<
  ComponentProps<typeof MoonPaySellWidget>["onUrlSignatureRequested"]
> = handleGetSignature;

export function SigningExample() {
  return (
    <MoonPayProvider apiKey="pk_test_reference_only">
      <MoonPaySellWidget
        variant="overlay"
        baseCurrencyCode="eth"
        baseCurrencyAmount="0.045"
        onUrlSignatureRequested={onUrlSignatureRequested}
        visible
      />
    </MoonPayProvider>
  );
}
