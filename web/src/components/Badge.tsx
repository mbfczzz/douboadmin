import { stateText } from "../api";
export default function Badge({
  state,
  label,
}: {
  state: string;
  label?: string;
}) {
  return (
    <span className={"badge " + state}>
      <i />
      {label ?? (stateText[state] || state)}
    </span>
  );
}
