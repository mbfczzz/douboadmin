import { stateText } from "../api";
export default function Badge({ state }: { state: string }) {
  return (
    <span className={"badge " + state}>
      <i />
      {stateText[state] || state}
    </span>
  );
}
