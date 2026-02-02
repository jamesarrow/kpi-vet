import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Метрики ветклиники",
  description: "Возвращаемость клиентов по выгрузке",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="min-h-screen flex">
          <aside className="hidden md:block w-80 border-r bg-white">
            <Sidebar />
          </aside>

          <div className="flex-1 min-w-0">
            <div className="md:hidden sticky top-0 z-10 border-b bg-white px-4 py-3">
              <a href="/" className="font-semibold">Метрики ветклиники</a>
            </div>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
