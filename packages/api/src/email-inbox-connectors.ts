import type { GoogleOAuthCredentialInput } from "@dawn/env/google-oauth";
import { resolveGoogleOAuthCredentials } from "@dawn/env/google-oauth";
import {
  createEmailInboxTokenCodec,
  createGmailEmailInboxProvider,
  createMockEmailInboxProvider,
  InboxConnector,
} from "@dawn/integrations";

export type DefaultEmailInboxConnectorInput = GoogleOAuthCredentialInput & {
  BETTER_AUTH_SECRET: string;
};

export function createDefaultEmailInboxConnectors(input: DefaultEmailInboxConnectorInput) {
  const tokenCodec = createEmailInboxTokenCodec({
    secret: input.BETTER_AUTH_SECRET,
    keyId: "server-email-inbox-token-v1",
  });
  const googleOAuthCredentials = resolveGoogleOAuthCredentials(input);
  const providers = [
    createMockEmailInboxProvider(),
    ...(googleOAuthCredentials
      ? [
          createGmailEmailInboxProvider({
            clientId: googleOAuthCredentials.clientId,
            clientSecret: googleOAuthCredentials.clientSecret,
          }),
        ]
      : []),
  ];

  return providers.map((provider) => new InboxConnector({ provider, tokenCodec }));
}
