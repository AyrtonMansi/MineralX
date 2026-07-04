import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";

type Props = {
  eyebrow: string;
  heading: string;
  intro?: string;
  align?: "left" | "center";
  className?: string;
};

/** Shared section header: tracked eyebrow + bold display heading + optional intro. */
export function SectionHeading({
  eyebrow,
  heading,
  intro,
  align = "left",
  className = "",
}: Props) {
  const isCenter = align === "center";
  return (
    <Reveal
      className={`flex flex-col ${
        isCenter ? "items-center text-center" : "items-start"
      } ${className}`}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className={`display mt-5 text-3xl sm:text-4xl lg:text-[3.25rem] ${
          isCenter ? "max-w-3xl" : "max-w-2xl"
        }`}
      >
        {heading}
      </h2>
      {intro && (
        <p
          className={`body-copy mt-5 ${isCenter ? "max-w-2xl" : "max-w-xl"}`}
        >
          {intro}
        </p>
      )}
    </Reveal>
  );
}
