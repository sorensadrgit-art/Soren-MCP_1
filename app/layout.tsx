
import "./globals.css";
export const metadata={
  title:"Soren Universal Skill Router",
  description:"Federated MCP skill discovery and review across external providers",
};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
