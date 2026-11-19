"use client";
import { useT } from "@/lib/i18n";

export default function Privacy() {
  const { lang } = useT();
  const vi = lang === "vi";
  const items = vi
    ? [
        "Contract không có owner, không có hàm rút tiền, mint, phí, pause hay nâng cấp. Không ai ngoài bạn có thể chuyển tiền của bạn.",
        "Tiền đi thẳng từ người nợ tới chủ nợ trong cùng giao dịch; contract không giữ số dư.",
        "USDT: bạn approve đúng số tiền của lần trả đó, không approve không giới hạn.",
        "Không thu thập seed phrase, private key, API secret hay pairing code. Không đăng nhập bằng QR/pairing code. Máy chủ không giữ session giao dịch.",
        "AI agent chỉ đề xuất cách chia; người nhận luôn lấy từ contract chứ không từ AI. Mọi giao dịch do bạn tự ký.",
        "Mô tả khoản chi lưu off-chain, chỉ hash lên chain. Dữ liệu on-chain (địa chỉ, số tiền) là công khai.",
        "Ảnh hóa đơn chỉ được xử lý trong bộ nhớ của yêu cầu rồi bỏ đi, không lưu và không dùng để huấn luyện.",
        "Thành viên chỉ tham gia qua link mời; không có tính năng tìm người theo tên .ai.",
        "SplitMate là công cụ ghi sổ và cấn trừ nợ giữa bạn bè, không phải dịch vụ thanh toán hàng hóa/dịch vụ.",
      ]
    : [
        "The contract has no owner, no withdraw, mint, fee, pause or upgrade function. Nobody but you can move your funds.",
        "Payments go straight from debtor to creditor in the same transaction; the contract holds no balance.",
        "USDT: you approve exactly that payment's amount, never an unlimited allowance.",
        "We never collect seed phrases, private keys, API secrets or pairing codes. No QR/pairing-code login. The server holds no trading session.",
        "The AI agent only proposes splits; recipients always come from the contract, not from the AI. You sign every transaction.",
        "Expense descriptions are stored off-chain; only a hash goes on-chain. On-chain data (addresses, amounts) is public.",
        "Receipt photos are processed in memory for one request and discarded, never stored or used for training.",
        "Members join only via invite links; there is no search by .ai name.",
        "SplitMate is a ledger for settling debts between friends, not a payment service for goods or services.",
      ];
  return (
    <section className="card">
      <h2>{vi ? "Quyền riêng tư & minh bạch" : "Privacy & transparency"}</h2>
      <ul>
        {items.map((s) => (
          <li key={s} style={{ marginBottom: 6 }}>
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}
