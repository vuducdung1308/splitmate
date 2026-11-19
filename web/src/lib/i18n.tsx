"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "vi" | "en";
const dict = {
  appTagline: { vi: "Chia hóa đơn nhóm, trả nợ on-chain bằng Agent ID", en: "Split group bills, settle on-chain with Agent ID" },
  connect: { vi: "Kết nối ví", en: "Connect wallet" },
  disconnect: { vi: "Ngắt kết nối", en: "Disconnect" },
  noWallet: { vi: "Mở trang này trong Binance Wallet (trình duyệt trong app) hoặc cài extension.", en: "Open this page in Binance Wallet's in-app browser or install the extension." },
  wrongChain: { vi: "Sai mạng. Chuyển sang", en: "Wrong network. Switch to" },
  notDeployed: { vi: "Chưa có contract trên mạng này.", en: "No contract deployed on this network." },
  agentStatus: { vi: "Agent ID", en: "Agent ID" },
  hasAgent: { vi: "Đã có Agent ID", en: "Agent ID verified" },
  noAgent: { vi: "Chưa có Agent ID. Claim Agent ID trong Binance Wallet hoặc liên kết Agentic Wallet.", en: "No Agent ID yet. Claim one in Binance Wallet or link your Agentic Wallet." },
  linkAgent: { vi: "Liên kết Agentic Wallet", en: "Link Agentic Wallet" },
  myGroups: { vi: "Nhóm của tôi", en: "My groups" },
  noGroups: { vi: "Chưa có nhóm nào.", en: "No groups yet." },
  createGroup: { vi: "Tạo nhóm / chuyến đi", en: "Create group / trip" },
  groupName: { vi: "Tên nhóm", en: "Group name" },
  payToken: { vi: "Token thanh toán", en: "Payment token" },
  create: { vi: "Tạo", en: "Create" },
  members: { vi: "Thành viên", en: "Members" },
  invite: { vi: "Link mời", en: "Invite link" },
  copy: { vi: "Sao chép", en: "Copy" },
  copied: { vi: "Đã chép", en: "Copied" },
  newInvite: { vi: "Tạo link mời mới (7 ngày)", en: "New invite link (7 days)" },
  inviteNote: { vi: "Link chỉ hiện một lần trên thiết bị này. Ai có link và có Agent ID đều tham gia được.", en: "Shown once on this device. Anyone with the link and an Agent ID can join." },
  addExpense: { vi: "Ghi khoản chi", en: "Add expense" },
  description: { vi: "Mô tả", en: "Description" },
  amount: { vi: "Số tiền", en: "Amount" },
  whoUsed: { vi: "Ai sử dụng?", en: "Who used it?" },
  splitMode: { vi: "Cách chia", en: "Split" },
  equal: { vi: "Đều", en: "Equally" },
  exact: { vi: "Theo số tiền", en: "Exact amounts" },
  percent: { vi: "Theo %", en: "By %" },
  shares: { vi: "Theo phần", en: "By parts" },
  privacyWarn: { vi: "Mô tả lưu off-chain, chỉ hash lên chain. Đừng nhập thông tin cá nhân.", en: "Description is stored off-chain; only its hash goes on-chain. Don't enter personal data." },
  save: { vi: "Ghi lên chain", en: "Record on-chain" },
  balances: { vi: "Số dư", en: "Balances" },
  suggested: { vi: "Gợi ý thanh toán tối thiểu", en: "Suggested settlements" },
  allSettled: { vi: "Đã cân bằng, không ai nợ ai.", en: "All settled up." },
  pay: { vi: "Trả", en: "Pay" },
  markReceived: { vi: "Đã nhận ngoài chuỗi", en: "Received off-chain" },
  expenses: { vi: "Khoản chi", en: "Expenses" },
  dispute: { vi: "Khiếu nại", en: "Dispute" },
  cancel: { vi: "Hủy", en: "Cancel" },
  cancelled: { vi: "Đã hủy", en: "Cancelled" },
  disputed: { vi: "Bị khiếu nại", en: "Disputed" },
  history: { vi: "Lịch sử on-chain", en: "On-chain history" },
  closeGroup: { vi: "Đóng sổ", en: "Close group" },
  closed: { vi: "Đã đóng sổ", en: "Closed" },
  totalSpent: { vi: "Tổng chi", en: "Total spent" },
  join: { vi: "Tham gia nhóm", en: "Join group" },
  joinNeedAgent: { vi: "Cần Agent ID để tham gia.", en: "An Agent ID is required to join." },
  agentAssist: { vi: "Nhờ agent (ngôn ngữ tự nhiên / ảnh hóa đơn)", en: "Ask the agent (text / receipt photo)" },
  agentPlaceholder: { vi: "VD: tối qua tôi trả 60 usdt lẩu, An không ăn", en: "e.g. I paid 60 usdt for hotpot last night, An didn't eat" },
  propose: { vi: "Đề xuất bản chia", en: "Propose split" },
  agentNote: { vi: "Agent chỉ đề xuất. Bạn kiểm tra và tự ký giao dịch.", en: "The agent only proposes. You review and sign yourself." },
  confirmTitle: { vi: "Xác nhận trước khi ký", en: "Confirm before signing" },
  recipient: { vi: "Người nhận", en: "Recipient" },
  token: { vi: "Token", en: "Token" },
  sign: { vi: "Ký giao dịch", en: "Sign transaction" },
  approveExact: { vi: "Approve đúng số tiền", en: "Approve exact amount" },
  pending: { vi: "Đang chờ…", en: "Pending…" },
  displayName: { vi: "Tên .ai hiển thị", en: "Display .ai name" },
  setName: { vi: "Lưu tên", en: "Save name" },
  you: { vi: "bạn", en: "you" },
  owes: { vi: "nợ", en: "owes" },
  isOwed: { vi: "được nhận", en: "is owed" },
  testnetFaucet: { vi: "Testnet: nhận Agent ID + USDT thử", en: "Testnet: get test Agent ID + USDT" },
  back: { vi: "← Quay lại", en: "← Back" },
  privacy: { vi: "Quyền riêng tư & minh bạch", en: "Privacy & transparency" },
} as const;

export type Key = keyof typeof dict;
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "vi",
  setLang: () => {},
  t: (k) => dict[k].vi,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("vi");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "en" || saved === "vi") setLang(saved);
    } catch {}
  }, []);
  const change = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
  };
  return <Ctx.Provider value={{ lang, setLang: change, t: (k) => dict[k][lang] }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
