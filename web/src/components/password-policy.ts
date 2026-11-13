export const PASSWORD_HINT =
  "8位，仅限英文字母和数字，且必须包含大写和小写字母";
export const PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{8}";
export const passwordRules = {
  minLength: 8,
  maxLength: 8,
  pattern: PASSWORD_PATTERN,
  title: PASSWORD_HINT,
};
export const validPassword = (value: string) =>
  value.length === 8 && new RegExp(`^${PASSWORD_PATTERN}$`).test(value);
