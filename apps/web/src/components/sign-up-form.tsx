import { Button } from "@dawn/ui/components/button";
import { Input } from "@dawn/ui/components/input";
import { Label } from "@dawn/ui/components/label";
import { toastManager } from "@dawn/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import {
  clearGoogleInboxConnectIntent,
  googleInboxAuthScopes,
  googleInboxCallbackUrl,
  rememberGoogleInboxConnectIntent,
} from "@/lib/google-inbox-auth";

import Loader from "./loader";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();
  const [googlePending, setGooglePending] = useState(false);

  async function signUpWithGoogle() {
    setGooglePending(true);
    rememberGoogleInboxConnectIntent();
    await authClient.signIn.social(
      {
        provider: "google",
        callbackURL: googleInboxCallbackUrl(),
        scopes: googleInboxAuthScopes(),
      },
      {
        onError: (error) => {
          setGooglePending(false);
          clearGoogleInboxConnectIntent();
          toastManager.add({
            title: error.error.message || error.error.statusText,
            type: "error",
          });
        },
      },
    );
  }

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toastManager.add({ title: "Sign up successful", type: "success" });
          },
          onError: (error) => {
            toastManager.add({
              title: error.error.message || error.error.statusText,
              type: "error",
            });
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto w-full mt-10 max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Create Account</h1>

      <Button
        className="mb-4 w-full"
        loading={googlePending}
        onClick={() => void signUpWithGoogle()}
        type="button"
        variant="outline"
      >
        <MailIcon aria-hidden="true" className="size-4" />
        Continue with Google
      </Button>

      <div className="mb-4 flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>Email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Name</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-red-500">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Submitting..." : "Sign Up"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignIn}
          className="text-indigo-600 hover:text-indigo-800"
          type="button"
        >
          Already have an account? Sign In
        </Button>
      </div>
    </div>
  );
}
