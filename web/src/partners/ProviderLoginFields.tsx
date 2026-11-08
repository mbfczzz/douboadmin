import RoleSelect from "../roles/RoleSelect";

// Login account created together with a new provider.
export default function ProviderLoginFields({
  disabled,
}: {
  disabled?: boolean;
}) {
  return (
    <fieldset className="provider-login" disabled={disabled}>
      <legend>登录账号</legend>
      <p className="quiet">
        服务商用这个账号登录豆播后台，只能看到本服务商及其下级。
      </p>
      <div className="form-grid">
        <label>
          账号
          <input
            name="accountUsername"
            autoComplete="off"
            pattern="[A-Za-z0-9._-]{3,32}"
            title="3–32 位字母、数字、点、横线或下划线"
            required
          />
        </label>
        <label>
          初始密码
          <input
            name="accountPassword"
            type="password"
            autoComplete="new-password"
            minLength={16}
            maxLength={128}
            required
          />
        </label>
      </div>
      <label>
        角色
        <RoleSelect scope="partner" name="accountRole" />
      </label>
    </fieldset>
  );
}
