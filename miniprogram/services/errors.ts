export class AuthCancelledError extends Error {
  constructor() {
    super("已取消登录");
  }
}
export class PaymentCancelledError extends AuthCancelledError {
  constructor() {
    super();
    this.message = "已取消本次支付";
  }
}
export class SessionExpiredError extends Error {
  constructor() {
    super("登录已过期，请重新登录");
  }
}
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "",
  ) {
    super(message);
  }
}

export function errorMessage(value: unknown, fallback = "操作失败") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value && typeof value === "object") {
    const error = value as { message?: unknown; errMsg?: unknown };
    for (const message of [error.message, error.errMsg]) {
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  return fallback;
}
