import { AuthScreen } from "./auth-screen";

// Thin adapter — the route's loader/action stays exactly the same; the
// visual layout now lives in the shared AuthScreen, which renders the
// react-router <Form method="post"> with the same field names ("email",
// "password") that app/routes/signin.tsx already reads.
export const SignInScreen = ({
  error,
  onGoRegister,
  onForgot,
  onBack,
}: {
  error?: string;
  onGoRegister?: () => void;
  onForgot?: () => void;
  onBack?: () => void;
}) => (
  <AuthScreen
    mode="login"
    error={error}
    onSwitch={onGoRegister}
    onForgot={onForgot}
    onBack={onBack}
  />
);
