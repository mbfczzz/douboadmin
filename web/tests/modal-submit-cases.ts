export type SubmitCase = {
  name: string;
  nav: string;
  open: string;
  submit: string;
  endpoint: string;
  fields: Record<string, string>;
  // Provider row button that opens the function dialog holding `open`.
  module?: string;
  pick?: boolean;
};

export const submitCases: SubmitCase[] = [
  {
    name: "订单退款",
    nav: "充值订单",
    open: "退款",
    submit: "确认全额退款",
    endpoint: "/orders/qa-order/refund",
    fields: { 退款原因: "仅验证输入保留" },
  },
  {
    name: "作品审核",
    nav: "内容审核",
    open: "查看并审核",
    submit: "审核通过",
    endpoint: "/reviews/qa-job",
    fields: { "审核说明（驳回必填）": "仅验证输入保留" },
  },
  {
    name: "管理账号",
    nav: "管理账号",
    open: "添加管理账号",
    submit: "创建账号",
    endpoint: "/accounts",
    fields: {
      登录账号: "modal-check",
      姓名: "弹窗测试",
      初始密码: "fixture-password-2026",
    },
  },
  {
    name: "模型导入",
    nav: "模型管理",
    open: "新增模型",
    submit: "添加模型",
    endpoint: "/models",
    fields: { "模型 ID": "fixture-model" },
  },
  {
    name: "模板编辑",
    nav: "创作模板",
    open: "编辑",
    submit: "保存模板",
    endpoint: "/templates/qa-template",
    fields: { 模板名称: "保留的模板草稿" },
  },
  {
    name: "新增服务商",
    nav: "服务商管理",
    open: "新增服务商",
    submit: "保存服务商",
    endpoint: "/partners",
    fields: {
      服务商名称: "保留的服务商草稿",
      可授权账号额度: "10",
      账号: "draft-provider",
      初始密码: "draft-provider-password",
    },
  },
  {
    name: "服务商基本信息",
    nav: "服务商管理",
    open: "编辑",
    submit: "保存服务商",
    endpoint: "/partners/qa-provider",
    fields: { 服务商名称: "保留的修改草稿" },
  },
  {
    name: "名额划拨",
    nav: "服务商管理",
    module: "名额划拨",
    open: "划拨名额",
    submit: "确认划拨 1 个名额",
    pick: true,
    endpoint: "/quota-moves",
    fields: { 原因: "仅验证输入保留" },
  },
  {
    name: "名额申请",
    nav: "服务商管理",
    module: "名额划拨",
    open: "向上级申请",
    submit: "提交申请",
    endpoint: "/quota-requests",
    fields: { 原因: "仅验证输入保留" },
  },
  {
    name: "名额审批",
    nav: "服务商管理",
    module: "名额划拨",
    open: "批准",
    submit: "批准并划拨",
    endpoint: "/quota-requests/qa-request",
    fields: { 审批说明: "仅验证输入保留" },
  },
  {
    name: "生成授权码",
    nav: "服务商管理",
    module: "授权码",
    open: "生成授权码",
    submit: "生成并预留名额",
    endpoint: "/activation-codes",
    fields: { 备注: "仅验证输入保留" },
  },
  {
    name: "用户授权",
    nav: "服务商管理",
    module: "授权码",
    open: "停用",
    submit: "停用授权",
    endpoint: "/memberships/qa-user",
    fields: { 原因: "仅验证输入保留" },
  },
  {
    name: "申请提现",
    nav: "服务商管理",
    module: "分佣",
    open: "申请提现",
    submit: "预留提现佣金",
    endpoint: "/commission-payouts",
    fields: { "提现金额（元）": "1", 说明: "仅验证输入保留" },
  },
  {
    name: "确认打款",
    nav: "服务商管理",
    module: "分佣",
    open: "确认打款",
    submit: "登记打款",
    endpoint: "/commission-payouts/qa-payout",
    fields: { 打款流水号: "仅验证输入保留" },
  },
  {
    name: "取消提现",
    nav: "服务商管理",
    module: "分佣",
    open: "取消提现",
    submit: "取消提现",
    endpoint: "/commission-payouts/qa-payout",
    fields: { 取消原因: "仅验证输入保留" },
  },
];
