import Modal from "../components/Modal";
import RequestState from "../components/RequestState";
import { useResource } from "../hooks/useResource";
export default function CodeReveal({
  id,
  onClose,
  notify,
}: {
  id: string;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const resource = useResource<{ code: string; qr: string }>(
    "/admin/activation-codes/" + id,
  );
  return (
    <Modal title="授权二维码 / 激活码" onClose={onClose}>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      />
      {resource.data && (
        <div className="activation-code-preview">
          <img
            src={resource.data.qr}
            alt="豆播授权二维码"
            width="240"
            height="240"
          />
          <strong className="mono">
            {resource.data.code.match(/.{1,4}/g)?.join("-")}
          </strong>
          <p>
            用户微信登录后，在豆播的授权页扫码或输入激活码。该码仅能激活一个微信账号。
          </p>
          <div className="business-actions">
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(resource.data!.code);
                  notify("激活码已复制");
                } catch {
                  notify("请手动选择并复制激活码");
                }
              }}
            >
              复制激活码
            </button>
            <a
              className="secondary"
              href={resource.data.qr}
              download="豆播授权二维码.png"
            >
              下载二维码
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
