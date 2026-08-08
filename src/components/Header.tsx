import { Link } from "@tanstack/react-router";

const title = "Hacker News Reader";

type Pages = "top" | "best";

export default function Header({ activePage }: { activePage?: Pages }) {
  return (
    <header className="mx-auto flex min-w-64 max-w-4xl justify-between px-4 pb-12 pt-16 font-mono">
      <span>{title}</span>
      <span>
        <Link className={activePage === "top" ? "underline" : ""} to="/">
          Top
        </Link>{" "}
        <Link
          className={activePage === "best" ? "underline" : ""}
          to="/best"
        >
          Best
        </Link>
      </span>
    </header>
  );
}
