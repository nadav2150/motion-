import { AuthScreen } from "./auth-screen";

// Thin adapter — the route's action handler still reads "name", "email",
// "password" from the posted form. AuthScreen renders the matching
// <Form method="post"> with those input names so behavior is preserved.
export const RegisterScreen = ({
  error,
  onGoSignIn,
  onBack,
}: {
  error?: string;
  onGoSignIn?: () => void;
  onBack?: () => void;
}) => (
  <AuthScreen
    mode="register"
    error={error}
    onSwitch={onGoSignIn}
    onBack={onBack}
  />
);
