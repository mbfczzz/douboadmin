import { passwordRules, PASSWORD_HINT } from "../components/password-policy";
import { useState } from "react";
import RoleSelect from "../roles/RoleSelect";
import { randomAccount, randomPassword } from "../components/credentials";

// Login account created together with a new provider, prefilled with a
// generated account and password the admin may keep or change.
export default function ProviderLoginFields({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [account] = useState(randomAccount),
    [password] = useState(() => randomPassword());
  return (
    <fieldset className="provider-login" disabled={disabled}>
      <legend>登录账号</legend>
      <p className="quiet">
        服务商用这个账号登录豆播后台，只能看到本服务商及其下级。
      </p>
      <div className="form-grid">
        <label>
          负责人手机号
          <input
            name="branchPhone"
            aria-label="负责人手机号"
            inputMode="tel"
            pattern="1[0-9]{10}"
            maxLength={11}
            required
          />
          <small className="quiet">
            小程序验证此手机号后直接进入分公司，无需扫码。
          </small>
        </label>
        <label>
          账号
          <input
            name="accountUsername"
            defaultValue={account}
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
            aria-label="初始密码"
            defaultValue={password}
            spellCheck={false}
            autoComplete="off"
            {...passwordRules}
            required
          />
          <small className="quiet">{PASSWORD_HINT}</small>
        </label>
      </div>
      <label>
        角色
        <RoleSelect scope="partner" name="accountRole" providerRole="branch" />
      </label>
    </fieldset>
  );
}
