import { DateLabel, Panel } from './shared.jsx';

const starNumber = new Intl.NumberFormat('zh-CN');
const changeNumber = new Intl.NumberFormat('zh-CN', { signDisplay: 'exceptZero' });

function StarLine({ history }) {
  const first = history[0], last = history.at(-1);
  const max = Math.max(...history.map(point => point.stars));
  const min = Math.min(...history.map(point => point.stars));
  const range = max - min || 1;
  const x = point => 8 + 584 * (point.observed_at - first.observed_at) / (last.observed_at - first.observed_at || 1);
  const y = point => max === min ? 65 : 117 - 104 * (point.stars - min) / range;
  const line = history.map(point => x(point) + ',' + y(point)).join(' ');
  return <figure className="star-plot">
    <div className="star-plot-area">
      <div className="star-axis-values" aria-hidden="true">
        <span>{starNumber.format(max)}</span>{min !== max && <span>{starNumber.format(min)}</span>}
      </div>
      <div>
        <svg className="star-line" viewBox="0 0 600 130" role="img" aria-labelledby="star-line-title">
          <title id="star-line-title">{'累计 Star 曲线，共 ' + history.length + ' 个观测点'}</title>
          <path className="star-grid" d="M 8 13 H 592 M 8 65 H 592 M 8 117 H 592"/>
          <polyline points={line} className="star-stroke" vectorEffect="non-scaling-stroke"/>
          {history.map(point => <circle key={point.observed_at} cx={x(point)} cy={y(point)} r="3" className="star-dot">
            <title>{new Date(point.observed_at * 1000).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
              {' · ' + starNumber.format(point.stars) + ' Stars'}</title>
          </circle>)}
        </svg>
        <div className="star-axis-dates"><DateLabel value={first.observed_at}/><DateLabel value={last.observed_at}/></div>
      </div>
    </div>
    <details className="star-observations">
      <summary>查看每日记录</summary>
      <table><thead><tr><th scope="col">日期（北京时间）</th><th scope="col">累计 Star</th></tr></thead>
        <tbody>{[...history].reverse().map(point => <tr key={point.observed_at}>
          <td><DateLabel value={point.observed_at}/></td><td>{starNumber.format(point.stars)}</td>
        </tr>)}</tbody></table>
    </details>
  </figure>;
}

export function GitHubStars({ item }) {
  if (!item.stars_source_url) return null;
  const history = item.star_history ?? [];
  const hasTrend = history.length > 1;
  const change = hasTrend ? history.at(-1).stars - history[0].stars : 0;
  return <Panel title="GitHub Star · 近 30 天" className="resource-guide star-insights">
    <div className="star-insights-body">
      <div className="star-summary">
        <div><span>累计 Star</span><strong>{item.stars == null ? '待同步' : starNumber.format(item.stars)}</strong></div>
        {hasTrend && <div><span>观测期变化</span><strong className={change < 0 ? 'star-loss' : 'star-gain'}>
          {changeNumber.format(change)}</strong></div>}
      </div>
      {item.stars_observed_at != null && <p className="star-checked">最近同步 <DateLabel value={item.stars_observed_at}/></p>}
      {hasTrend ? <StarLine history={history}/> :
        <p className="star-empty">{item.stars == null ? '首次同步后会显示累计 Star。' : '积累至少两个日快照后会显示趋势。'}</p>}
    </div>
  </Panel>;
}

export function GitHubReadme({ profile, source }) {
  if (!profile || (!profile.introduction && !profile.use_cases.length) || !source) return null;
  return <Panel title="资源简介与用途" className="resource-guide" action={
    <a className="small-link" href={source.canonical_url + '#readme'} rel="noreferrer" target="_blank">原始 README ↗</a>
  }>
    <div className="padded readme-profile">
      {profile.introduction && <div><h3>资源简介</h3><p>{profile.introduction}</p></div>}
      {profile.use_cases.length > 0 && <div><h3>资源用途与功能</h3><ul>
        {profile.use_cases.map(text => <li key={text}>{text}</li>)}
      </ul></div>}
    </div>
  </Panel>;
}
