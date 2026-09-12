import Link from "next/link";
import Image from "next/image";

export function Logo() {
  return <Link className="brand" href="/" aria-label="Nigerian Library Association, Osun State Chapter home"><Image className="brand-logo" src="/nla-osun-logo.png" width={64} height={64} alt="Nigerian Library Association emblem"/><span><b>Nigerian Library Association</b><small>Osun State Chapter</small></span></Link>;
}
