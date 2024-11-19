import type { Metadata } from "next";
import { Poppins } from 'next/font/google';
import "./globals.css";
import { AuthProvider } from "./lib/contexts";
import NavBar from './components/NavBar';


export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

const poppins = Poppins({
  subsets: ['latin'],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} antialiased`}>
        <AuthProvider>
          <div
            className="min-h-screen p-6"
            style={{
              background: `linear-gradient(
                0deg, 
                #C8D2F9 0%, 
                #7594A4 50%, 
                #84969F 79%, 
                #999999 100%)`,
            }}
          >
            <NavBar />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
