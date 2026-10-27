import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "USCC – Trọng tài",
  description: "Cập nhật kết quả giải cờ vua USCC",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#38bdf8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
