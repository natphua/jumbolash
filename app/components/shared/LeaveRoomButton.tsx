"use client";

interface LeaveRoomButtonProps {
  text?: string;
  confirmStatement: string;
  handleConfirm: () => void | Promise<void>;
  className?: string;
}

export default function LeaveRoomButton({
  text = "LEAVE ROOM",
  confirmStatement,
  handleConfirm,
  className = "",
}: LeaveRoomButtonProps) {
  const handleClick = async () => {
    if (!confirm(confirmStatement)) return;
    await handleConfirm();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`game-box-jagged bg-rose-700 text-white px-5 py-2 text-sm cursor-pointer hover:bg-rose-800 ${className}`}
    >
      {text}
    </button>
  );
}
