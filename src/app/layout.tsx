import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";

// Делаем сайт заметно быстрее: страницы и навигация кэшируются,
// а после загрузки Excel кэш точечно инвалидируется (см. upload/route.ts)
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Метрики ветклиники",
  description: "Возвращаемость, частота повторных визитов и churn по выгрузке",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <div className="min-h-screen flex">
          <aside className="hidden md:block w-80 border-r bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 shadow-sm">
            <Sidebar />
          </aside>

          <div className="flex-1 min-w-0">
            <div className="md:hidden sticky top-0 z-10 border-b bg-white/80 backdrop-blur px-4 py-3 shadow-sm">
              <a href="/" className="font-semibold">
                Метрики ветклиники
              </a>
            </div>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
