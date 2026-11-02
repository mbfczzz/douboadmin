export default function Empty({
  text = "还没有记录",
  help = "用户开始创作后，内容会显示在这里。",
}: {
  text?: string;
  help?: string;
}) {
  return (
    <div className="empty">
      <h3>{text}</h3>
      <p>{help}</p>
    </div>
  );
}
