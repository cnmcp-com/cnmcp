export default function Loading() {
  return (
    <div className="wrap discover" aria-busy="true" aria-label="正在加载">
      <div className="skel">
        <span className="sk-tile" />
        <span className="sk-lines">
          <span className="sk-l w60" />
          <span className="sk-l w85" />
          <span className="sk-l w60" />
        </span>
      </div>
      <div className="skel">
        <span className="sk-tile" />
        <span className="sk-lines">
          <span className="sk-l w60" />
          <span className="sk-l w85" />
          <span className="sk-l w60" />
        </span>
      </div>
      <div className="skel">
        <span className="sk-tile" />
        <span className="sk-lines">
          <span className="sk-l w60" />
          <span className="sk-l w85" />
        </span>
      </div>
    </div>
  );
}
