"use client";

import { useState } from "react";
import { company, contact } from "@/lib/content";
import { Reveal } from "./Reveal";
import { ArrowRight } from "./icons";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // No backend required: compose an email to the MineralX inbox.
    const subject = `Website enquiry — ${name || "MineralX"}`;
    const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;
    window.location.href = `mailto:${company.email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <section
      id="contact"
      className="border-t border-line bg-ink-900 py-24 md:py-32"
    >
      <div className="container-site grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Reveal>
            <p className="eyebrow flex items-center gap-3">
              <span className="h-px w-8 bg-white/25" aria-hidden="true" />
              {contact.eyebrow}
            </p>
            <h2 className="display mt-5 text-3xl sm:text-4xl lg:text-[3.25rem]">
              {contact.heading}
            </h2>
            <p className="body-copy mt-6 max-w-sm">{contact.intro}</p>

            <div className="mt-10 space-y-8 text-sm">
              <div>
                <p className="eyebrow">Email</p>
                <a
                  href={`mailto:${company.email}`}
                  className="mt-2 block text-white transition-opacity hover:opacity-70"
                >
                  {company.email}
                </a>
              </div>
              <div>
                <p className="eyebrow">{company.postal.label}</p>
                <p className="mt-2 leading-relaxed text-muted">
                  {company.postal.lines.map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-8">
          <Reveal delay={0.1}>
            <form
              onSubmit={handleSubmit}
              className="border border-line bg-black p-7 md:p-10"
            >
              <div className="grid gap-8 sm:grid-cols-2">
                <Field label="Name" required>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="input"
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="input"
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
                    className="input resize-none"
                  />
                </Field>
              </div>

              <button type="submit" className="btn btn-primary group mt-8">
                Send message
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </form>
          </Reveal>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: transparent;
          border: 0;
          border-bottom: 1px solid rgba(255,255,255,0.14);
          padding: 10px 0;
          color: #fff;
          font-size: 15px;
          outline: none;
          transition: border-color .3s ease;
        }
        .input::placeholder { color: #5f5f66; }
        .input:focus { border-color: rgba(255,255,255,0.6); }
      `}</style>
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
