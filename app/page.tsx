import { SampleReview } from "./sample-review";

function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>;
}

export default function Home() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <a href="/" className="brand"><Mark/><span>Document<span className="brand-light"> to Excel</span></span></a>
      <nav aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#sample">Sample workspace</a>
        <span className="preview-badge"><span/>Private preview</span>
      </nav>
    </header>
    <main id="main">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span/>LESS COPYING. MORE CLARITY.</p>
          <h1>Your documents.<br/>Ready for <em>Excel.</em></h1>
          <p className="hero-description">Move from pages of information to tables you can work with. Upload a document, review the extracted data, and make every row count.</p>
          <a className="button primary" href="#sample">Explore a sample <span aria-hidden="true">↗</span></a>
          <p className="hero-note">A first look at your new document workspace.</p>
        </div>
        <div className="conversion-illustration" aria-label="Illustration of a document becoming a spreadsheet">
          <div className="paper"><div className="paper-top"><span>DOCUMENT</span><b>PDF</b></div><div className="paper-title"/><div className="paper-line"/><div className="paper-line short"/><div className="paper-grid"/><div className="paper-line"/><div className="paper-line short"/></div>
          <div className="transform-arrow" aria-hidden="true">↗</div>
          <div className="sheet"><div className="sheet-top"><span className="excel-mark">X</span><div><strong>Everything in its place</strong><small>Structured. Editable. Clear.</small></div><span className="sheet-dot"/></div><div className="illustration-grid" aria-hidden="true"><b>A</b><b>B</b><b>C</b><b>D</b>{Array.from({length:16},(_,i)=><span key={i} className={i===5?"selected":""}>{["Date","Description","Amount","Balance","01 Sep","Transfer","250.00","1,480.00","02 Sep","Utilities","−45.00","1,435.00","03 Sep","Refund","18.50","1,453.50"][i]}</span>)}</div><div className="sheet-bottom"><span/>Sample data</div></div>
          <div className="float-note"><span aria-hidden="true">✓</span> Room to review every detail</div>
        </div>
      </section>

      <section className="workspace" aria-labelledby="workspace-title">
        <div className="section-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="workspace-title">Start with a document</h2></div><span className="subtle-label">PDF · JPG · PNG</span></div>
        <div className="workspace-grid">
          <div className="upload-panel">
            <span className="upload-icon" aria-hidden="true">↑</span>
            <h3>A simpler way to work with tables</h3>
            <p>Your upload space will be ready when conversion is enabled.</p>
            <button className="button upload-button" disabled>Choose a document</button>
            <p className="setup-note">Uploads are not available in this preview. Explore the sample below.</p>
          </div>
          <aside className="workspace-aside"><span className="aside-label">BUILT AROUND YOUR WORK</span><h3>From a page<br/>to a useful table.</h3><p>Bank statements, invoices and reports often hold the information you need. The goal is to make that information easier to use.</p><div className="document-types"><span>Bank statements</span><span>Invoices</span><span>Reports</span></div><a href="#how-it-works">See the planned workflow <span aria-hidden="true">→</span></a></aside>
        </div>
      </section>

      <SampleReview/>

      <section id="how-it-works" className="how-it-works" aria-labelledby="steps-title">
        <div className="section-heading"><div><p className="eyebrow">THE PLANNED WORKFLOW</p><h2 id="steps-title">Three steps. A clearer spreadsheet.</h2></div></div>
        <div className="steps">
          <article><span className="step-number">01</span><h3>Add your document</h3><p>Upload a supported PDF or image directly to your private document storage.</p></article>
          <article><span className="step-number">02</span><h3>Check the details</h3><p>Review extracted tables and correct uncertain values before exporting.</p></article>
          <article><span className="step-number">03</span><h3>Open it in Excel</h3><p>Download an XLSX workbook and continue your work with structured rows and columns.</p></article>
        </div>
      </section>
      <section className="faq" aria-labelledby="faq-title"><h2 id="faq-title">A few things to know</h2>
        <details><summary>Can I convert my files yet?</summary><p>This is the interface foundation. Uploads, extraction, accounts, billing and XLSX exports are not enabled yet. The sample workspace uses fictional data only.</p></details>
        <details><summary>Will every document convert perfectly?</summary><p>No. Image quality, layout and handwriting can affect extraction. The review step is part of the product so you can check important values against the source.</p></details>
        <details><summary>What happens to edits in the sample?</summary><p>They stay in this browser tab and reset when you reload. No sample edits are uploaded or saved to an account.</p></details>
      </section>
    </main>
    <footer><a className="brand" href="/"><Mark/><span>Document to Excel</span></a><p>Private product preview · Conversion coming after setup</p><a href="#main">Back to top ↑</a></footer>
  </>;
}
