"use client";

import { useState } from "react";

const sample = [
  { id: 1, date: "01 Sep 2026", description: "Opening balance", amount: "1,230.00", balance: "1,230.00" },
  { id: 2, date: "01 Sep 2026", description: "Example transfer", amount: "250.00", balance: "1,480.00" },
  { id: 3, date: "02 Sep 2026", description: "Example utilities", amount: "−45.00", balance: "1,435.00" },
  { id: 4, date: "03 Sep 2026", description: "Example refund", amount: "18.50", balance: "1,453.50" }
];

export function SampleReview() {
  const [rows, setRows] = useState(sample);
  const [message, setMessage] = useState("Try editing a description. Sample edits stay in this tab.");
  const [highlight, setHighlight] = useState(true);

  return <section id="sample" className="sample-section" aria-labelledby="sample-title">
    <div className="section-heading"><div><p className="eyebrow">TAKE A CLOSER LOOK</p><h2 id="sample-title">A table you can actually work with.</h2></div><span className="sample-badge">Fictional sample</span></div>
    <div className="review-card">
      <div className="review-toolbar"><div className="review-file"><span className="file-icon" aria-hidden="true">▤</span><div><strong>sample-statement.pdf</strong><small>4 sample rows · GBP</small></div></div>
        <div className="review-actions"><button type="button" aria-pressed={highlight} onClick={()=>setHighlight(!highlight)}>{highlight ? "Hide" : "Show"} review flag</button><button type="button" onClick={()=>{setRows(sample);setHighlight(true);setMessage("Sample reset. No data was uploaded.");}}>Reset sample</button></div>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Editable sample statement">
        <table><caption className="sr-only">Fictional bank statement. Descriptions can be edited.</caption><thead><tr><th scope="col">Row</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col" className="number">Amount (£)</th><th scope="col" className="number">Balance (£)</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id} className={row.id===3 && highlight?"flagged":""}><th scope="row">{String(row.id).padStart(2,"0")}</th><td>{row.date}</td><td><input maxLength={160} aria-label={"Description for row "+row.id} value={row.description} onChange={e=>{const value=e.target.value;setRows(current=>current.map(item=>item.id===row.id?{...item,description:value}:item));setMessage("Sample edited locally. Reloading will reset your changes.");}}/></td><td className="number">{row.amount}</td><td className="number">{row.balance}</td></tr>)}</tbody></table>
      </div>
      <div className="review-footer"><span className="review-flag"><span aria-hidden="true">◉</span> {highlight ? "Example review flag on row 3" : "Review flag hidden"}</span><span>Sample only · Export not enabled</span></div>
    </div>
    <p className="sample-message" role="status">{message}</p>
  </section>;
}
