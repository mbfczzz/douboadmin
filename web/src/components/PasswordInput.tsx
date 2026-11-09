import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

// Password field with a show / hide toggle inside the input.
export default function PasswordInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const [shown, setShown] = useState(false);
  return (
    <span className="password-input">
      <input {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="icon"
        aria-label={shown ? "隐藏密码" : "显示密码"}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}
