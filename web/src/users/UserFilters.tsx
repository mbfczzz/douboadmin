// Search and filters of the admin user list; the server applies them.
export default function UserFilters(p: {
  search: string;
  onSearch: (value: string) => void;
  state: string;
  onState: (value: string) => void;
  access: string;
  onAccess: (value: string) => void;
}) {
  return (
    <div className="business-filters">
      <input
        type="search"
        aria-label="搜索用户"
        placeholder="搜索昵称、姓名、手机号或编号"
        value={p.search}
        onChange={(e) => p.onSearch(e.target.value)}
      />
      <select
        aria-label="账号状态"
        value={p.state}
        onChange={(e) => p.onState(e.target.value)}
      >
        <option value="">全部状态</option>
        <option value="active">正常</option>
        <option value="disabled">已停用</option>
        <option value="archived">已删除</option>
      </select>
      <select
        aria-label="开通状态"
        value={p.access}
        onChange={(e) => p.onAccess(e.target.value)}
      >
        <option value="">全部开通状态</option>
        <option value="member">会员</option>
        <option value="owner">服务商负责人</option>
        <option value="review">待开通</option>
        <option value="none">未开通</option>
      </select>
    </div>
  );
}
