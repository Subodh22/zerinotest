import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="grid h-full place-items-center">
      <SignUp />
    </div>
  );
}
