// 標本 What is pointed at, set like a dictionary entry (PLAN.md, "The
// specimen"): one thing large — a kanji, a count, a level — and beside it
// what it is and where it stands, with a third, quieter line when there is
// more worth saying. The strip's kanji, the
// forecast's hours, the SRS spread's bands and the pace bars all read
// through it, so pointing at anything on the board answers the same way.
//
// The spaces between the parts are for the live region, which reads the
// text run together otherwise.
export default function Specimen({ glyph, kind = '', named, where = null, more = null }) {
  return (
    <div className="specimen">
      <span className={`glyph ${kind}`.trim()}>{glyph}</span>{' '}
      <div className="entry">
        <p className="named">{named}</p>
        {where ? (
          <>
            {' '}
            <p className="where">{where}</p>
          </>
        ) : null}
        {more ? (
          <>
            {' '}
            <p className="more">{more}</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
