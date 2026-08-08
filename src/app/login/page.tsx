import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
