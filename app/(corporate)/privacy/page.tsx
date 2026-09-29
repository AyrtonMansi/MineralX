import { PageIntro } from "@/components/Corporate";
import { company, enquiryHref } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata(
  "Privacy",
  "Information about website analytics and contacting MineralX by email.",
  "/privacy",
);

const sections = [
  { id: "contacting", title: "Contacting MineralX" },
  { id: "hosting", title: "Website hosting and analytics" },
  { id: "staff-workspace", title: "Private staff workspace" },
  { id: "enquiries", title: "Your enquiries" },
  { id: "external", title: "External services" },
];

export default function PrivacyPage() {
  const ext = "link-draw text-white/85 hover:text-white";
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        label="Website information"
        title="Privacy notice"
        intro="Information about how this website works and the enquiries you choose to send us."
      />
      <div className="container-site grid gap-14 py-20 md:py-28 lg:grid-cols-12">
        <nav aria-label="On this page" className="lg:col-span-3">
          <div className="lg:sticky lg:top-28">
            <p className="t-label">On this page</p>
            <ol className="mt-6 space-y-1 border-l border-line">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px flex min-h-10 items-center gap-4 border-l border-transparent pl-5 text-[14px] text-white/65 transition-colors hover:border-white hover:text-white"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="max-w-2xl space-y-20 lg:col-span-7 lg:col-start-5">
          <section id="contacting">
            <h2 className="t-display-md">Contacting MineralX</h2>
            <p className="body-copy mt-6">
              The contact links on this website open your email application. The
              website does not submit an enquiry or upload the contents of your
              email. If you send a message, MineralX receives the information
              you include, such as your name, email address, organisation and
              enquiry, to review and respond to your correspondence.
            </p>
          </section>
          <section id="hosting">
            <h2 className="t-display-md">Website hosting and analytics</h2>
            <p className="body-copy mt-6">
              This website is hosted on Vercel and uses Vercel Web Analytics to
              understand aggregate website usage. Vercel processes technical
              information to deliver the website and provide analytics. We do
              not add advertising trackers or a contact database to this
              website.
            </p>
            <p className="body-copy mt-5">
              More information is available in{" "}
              <a href="https://vercel.com/docs/analytics/privacy-policy" className={ext}>
                Vercel’s Web Analytics privacy documentation
              </a>{" "}
              and{" "}
              <a href="https://vercel.com/legal/privacy-policy" className={ext}>
                Vercel’s privacy policy
              </a>
              .
            </p>
          </section>
          <section id="staff-workspace">
            <h2 className="t-display-md">Private staff workspace</h2>
            <p className="body-copy mt-6">
              Access to the MineralX Operations workspace is assigned by
              MineralX. Once signed in, the workspace uses authentication
              cookies and stores operational records with an account-linked
              history of changes. These records are available to authorised
              members of the relevant workspace. The private workspace does not
              load Vercel Web Analytics.
            </p>
            <p className="body-copy mt-5">
              The device workspace, which can be opened without signing in,
              keeps its records in your browser on that device. Contact MineralX
              to request access changes or a record correction.
            </p>
          </section>
          <section id="enquiries">
            <h2 className="t-display-md">Your enquiries</h2>
            <p className="body-copy mt-6">
              Please include only information relevant to your enquiry. To ask
              about information you have provided, request a correction or raise
              a privacy concern, email{" "}
              <a className={`${ext} break-all`} href={enquiryHref("Privacy enquiry")}>
                {company.email}
              </a>
              .
            </p>
          </section>
          <section id="external">
            <h2 className="t-display-md">External services</h2>
            <p className="body-copy mt-6">
              Links to external websites and the email service you use are
              governed by their own privacy practices.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
