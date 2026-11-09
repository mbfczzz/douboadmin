import { date, type Row } from "../api";
import StatusBadge from "../components/StatusBadge";
import Badge from "../components/Badge";
import Tag, { IdChip } from "../components/Tag";
import DetailCard, { DetailHero, Field } from "../components/DetailCard";
import { channels, money, points, type Order } from "./types";

// Order details grouped into headline, order facts and purchased product.
export default function OrderSummary({ row }: { row: Row<Order> }) {
  const o = row.data,
    v = o.virtual,
    [channel, tone] = channels[o.channel || "wechat_jsapi"] || [
      o.channel,
      "muted",
    ];
  return (
    <>
      <DetailHero
        value={money(o.amountFen)}
        caption={
          o.paidAt
            ? `支付于 ${date(o.paidAt)}`
            : `创建于 ${date(row.createdAt)}`
        }
      >
        <Tag tone="accent">+{points(o.pointsUnits)} 积分</Tag>
        <StatusBadge status={o.status} />
        <Tag tone={tone}>{channel}</Tag>
        {v?.platform && (
          <Tag tone="info">{v.platform === "ios" ? "iOS" : "Android"}</Tag>
        )}
      </DetailHero>
      <DetailCard title="订单信息">
        <Field label="订单编号">
          <IdChip>{row.id}</IdChip>
        </Field>
        <Field label="微信交易号">
          {o.transactionId ? (
            <IdChip>{o.transactionId}</IdChip>
          ) : (
            <Tag>尚未支付</Tag>
          )}
        </Field>
        <Field label="用户">
          <IdChip>{o.userId}</IdChip>
        </Field>
        <Field label="创建时间">{date(row.createdAt)}</Field>
        <Field label="支付时间">{o.paidAt ? date(o.paidAt) : "—"}</Field>
        {o.refundId && (
          <Field label="退款单">
            <IdChip>{o.refundId}</IdChip>
          </Field>
        )}
      </DetailCard>
      {v && (
        <DetailCard title="积分商品">
          <Field label="商品">
            <Tag tone="accent">{v.productName}</Tag>
          </Field>
          <Field label="购买方式">
            {v.purchaseMode === "custom" ? (
              <Tag tone="warning">自定义金额</Tag>
            ) : (
              <Tag tone="info">积分套餐</Tag>
            )}
          </Field>
          <Field label="数量 × 单价">
            <span className="amount">
              {v.quantity || 1} × {money(v.unitFen || o.amountFen)}
            </span>
          </Field>
          {v.issued === false && (
            <Field label="微信支付">
              <Badge state="queued" label="尚未发起" />
            </Field>
          )}
        </DetailCard>
      )}
    </>
  );
}
