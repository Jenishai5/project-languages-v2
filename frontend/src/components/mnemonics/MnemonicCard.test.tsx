import { render, screen } from "@testing-library/react";
import MnemonicCard from "./MnemonicCard";

test("mnemonic card shows the generated picture and the story", () => {
  render(<MnemonicCard word="paper" translation="el papel" emoji="📄" imageUrl="https://signed.test/p.png" text="Un pato lee el periódico." />);

  expect(screen.getByRole("img", { name: "Memory picture for paper" })).toHaveAttribute("src", "https://signed.test/p.png");
  expect(screen.getByText("Un pato lee el periódico.")).toBeInTheDocument();
});

test("mnemonic card falls back to the emoji without a picture", () => {
  render(<MnemonicCard word="cat" translation="el gato" emoji="🐱" />);

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("🐱")).toBeInTheDocument();
});
