import { PageIntro } from "@/components/Corporate";
import { company, enquiryHref } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata(
  "Privacy",
  "Information about website analytics and contacting MineralX by email.",
  "/privacy",
);
export default function PrivacyPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        eyebrow="Website information"
        title="Privacy notice"
        intro="Information about how this website works and the enquiries you choose to send us."
      />
      <section className="container-site py-16 md:py-24">
        <div className="max-w-3xl space-y-10">
          <div>
            <h2 className="text-xl font-semibold">Contacting MineralX</h2>
            <p className="body-copy mt-4">
              The contact links on this website open your email application. The
              website does not submit an enquiry or upload the contents of your
              email. If you send a message, MineralX receives the information
              you include, such as your name, email address, organisation and
              enquiry, to review and respond to your correspondence.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">
              Website hosting and analytics
            </h2>
            <p className="body-copy mt-4">
              This website is hosted on Vercel and uses Vercel Web Analytics to
              understand aggregate website usage. Vercel processes technical
              information to deliver the website and provide analytics. We do
              not add advertising trackers or a contact database to this
              website.
            </p>
            <p className="body-copy mt-4">
              More information is available in{" "}
              <a
                href="https://vercel.com/docs/analytics/privacy-policy"
                className="underline underline-offset-4"
              >
                Vercel’s Web Analytics privacy documentation
              </a>{" "}
              and{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                className="underline underline-offset-4"
              >
                Vercel’s privacy policy
              </a>
              .
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Your enquiries</h2>
            <p className="body-copy mt-4">
              Please include only information relevant to your enquiry. To ask
              about information you have provided, request a correction or raise
              a privacy concern, email{" "}
              <a
                className="break-all underline underline-offset-4"
                href={enquiryHref("Privacy enquiry")}
              >
                {company.email}
              </a>
              .
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold">External services</h2>
            <p className="body-copy mt-4">
              Links to external websites and the email service you use are
              governed by their own privacy practices.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
