import "./globals.css";

export const metadata = { title: "AI Agent Email OS", description: "Guarded autonomous email operations" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
