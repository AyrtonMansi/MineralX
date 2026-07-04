"use client";

import { useState } from "react";
import { company, contact } from "@/lib/content";
import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";
import { ArrowRight } from "./icons";

type Status = "idle" | "sending" | "sent" | "error";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;

    // Without a configured endpoint, fall back to the visitor's mail client.
    if (!contact.formEndpoint) {
      const subject = `Website enquiry — ${name || "MineralX"}`;
      const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;
      window.location.href = `mailto:${company.email}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`;
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch(contact.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error(`Form endpoint returned ${res.status}`);
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section
      id="contact"
      className="border-t border-line bg-ink-900 py-24 md:py-32"
    >
      <div className="container-site grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Reveal>
            <Eyebrow>{contact.eyebrow}</Eyebrow>
            <h2 className="display mt-5 text-3xl sm:text-4xl lg:text-[3.25rem]">
              {contact.heading}
            </h2>
            <p className="body-copy mt-6 max-w-sm">{contact.intro}</p>
          </Reveal>
        </div>

        <div className="lg:col-span-8">
          <Reveal delay={0.1}>
            <form
              onSubmit={handleSubmit}
              className="border border-line bg-black p-7 md:p-10"
            >
              {status === "sent" ? (
                <div className="py-10 text-center">
                  <p className="text-lg font-semibold text-white">
                    Message sent.
                  </p>
                  <p className="mt-3 text-sm text-muted">
                    Thank you for your enquiry — we will be in touch.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="btn btn-ghost mt-8"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid gap-8 sm:grid-cols-2">
                    <Field label="Name" required>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Full name"
                        className="field-input"
                      />
                    </Field>
                    <Field label="Email" required>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="field-input"
                      />
                    </Field>
                  </div>

                  <div className="mt-8">
                    <Field label="Message" required>
                      <textarea
                        required
                        rows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="How can we help?"
                        className="field-input resize-none"
                      />
                    </Field>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-5">
                    <button
                      type="submit"
                      disabled={status === "sending"}
                      className="btn btn-primary group disabled:opacity-60"
                    >
                      {status === "sending" ? "Sending…" : "Send message"}
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </button>
                    {status === "error" && (
                      <p className="text-sm text-muted">
                        Something went wrong — please email{" "}
                        <a
                          href={`mailto:${company.email}`}
                          className="text-white underline underline-offset-4"
                        >
                          {company.email}
                        </a>
                        .
                      </p>
                    )}
                  </div>
                </>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">
        {label}
        {required && <span className="ml-1 text-white/60">*</span>}
      </span>
      <div className="mt-3">{children}</div>
    </label>
  );
}
