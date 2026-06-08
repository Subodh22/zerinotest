import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="grid h-full place-items-center">
      <SignIn />
    </div>
  );
}
