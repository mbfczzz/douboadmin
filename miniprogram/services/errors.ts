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
  ) {
    super(message);
  }
}
