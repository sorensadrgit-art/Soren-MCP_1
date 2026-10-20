import {SKILLS} from '../../lib/catalog.mjs';
import OperationsShell from '../../components/OperationsShell';
import PrivateLibrary from './private-library';
export default function Registry(){return <OperationsShell title="Approved library." description="Approval belongs to an exact source revision and content digest. Changed bytes do not inherit approval."><section className="opsPanel"><h2>Bundled public skills</h2><div className="recordList">{SKILLS.map(skill=><article className="record" key={skill.name}><h3>{skill.name}</h3><p>{skill.description}</p><code>{skill.uri}</code><p className="badge">BUNDLED · READ-ONLY REFERENCE</p></article>)}</div></section><PrivateLibrary/></OperationsShell>;}
