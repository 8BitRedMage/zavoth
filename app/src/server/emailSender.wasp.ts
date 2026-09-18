import { type EmailSender } from "@wasp.sh/spec";

export const emailSender: EmailSender = {
  // NOTE: "Dummy" provider is just for local development purposes.
  //   Make sure to check the server logs for the email confirmation url (it will not be sent to an address)!
  //   `deploy/deploy.sh` builds with EMAIL_PROVIDER=Resend, so production uses Resend (reads RESEND_API_KEY) while local dev stays on Dummy.
  provider: process.env.EMAIL_PROVIDER === "Resend" ? "Resend" : "Dummy",
  defaultFrom: {
    name: "Open SaaS App",
    // Must be on a domain verified in Resend.
    email: "noreply@mail.zavoth.com",
  },
};
