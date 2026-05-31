export default function WordDisplay({ word }) {
  return (
    <div id="word-display" className={word ? '' : 'hidden'}>
      <div id="word-text">{word}</div>
    </div>
  );
}
