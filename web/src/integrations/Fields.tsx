import Collection from "./Collection";
import { products, type IntegrationGroup } from "./types";

export default function Fields({
  group,
  values,
  clear,
  disabled,
  errorField,
  change,
  clearSecret,
}: {
  group: IntegrationGroup;
  values: Record<string, string>;
  clear: Record<string, boolean>;
  disabled: boolean;
  errorField: string;
  change: (key: string, value: string) => void;
  clearSecret: (key: string, value: boolean) => void;
}) {
  return (
    <div>
      {group.fields.map((field) => {
        const value = values[field.key] || "";
        const props = {
          disabled,
          value,
          "aria-label": field.label,
          "aria-invalid": errorField === field.key,
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
          ) => change(field.key, e.target.value),
        };
        if (field.kind === "products" || field.kind === "mapping")
          return (
            <Collection
              key={field.key}
              field={field}
              value={value}
              disabled={disabled}
              onChange={(v) => {
                change(field.key, v);
                if (
                  field.kind === "products" &&
                  !products(v).some(
                    (p) => p.id === values.WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID,
                  )
                ) {
                  change("WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID", "");
                }
              }}
            />
          );
        if (field.kind === "bool")
          return (
            <label className="checkbox" key={field.key}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={value === "true"}
                onChange={(e) => change(field.key, String(e.target.checked))}
              />
              {field.label}
              {field.hint && <small className="quiet">{field.hint}</small>}
            </label>
          );
        return (
          <div key={field.key}>
            <label>
              {field.label}
              {field.kind === "select" ? (
                <select {...props}>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.kind === "product" ? (
                <select {...props}>
                  <option value="">仅套餐购买</option>
                  {products(values.WECHAT_VIRTUAL_PRODUCTS)
                    .filter((p) => p.id)
                    .map((p, index) => (
                      <option key={index} value={p.id}>
                        {p.name || p.id}（{p.id}）
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  {...props}
                  type={
                    field.kind === "secret"
                      ? "password"
                      : field.kind === "url"
                        ? "url"
                        : "text"
                  }
                  maxLength={field.kind === "origins" ? 65536 : 4096}
                  autoComplete={
                    field.kind === "secret" ? "new-password" : "off"
                  }
                  disabled={disabled || !!clear[field.key]}
                  placeholder={
                    field.kind === "secret"
                      ? group.secrets[field.key]
                        ? "已配置，留空保持"
                        : "尚未配置"
                      : undefined
                  }
                />
              )}
              {field.hint && <small className="quiet">{field.hint}</small>}
            </label>
            {field.kind === "secret" && group.secrets[field.key] && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={!!clear[field.key]}
                  onChange={(e) => clearSecret(field.key, e.target.checked)}
                />
                清除{field.label}
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
