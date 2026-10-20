"use client";
import ManagementGate from '../../components/ManagementGate';
import PrivateWorkspace from '../../components/PrivateWorkspace';
import OperationsShell from '../../components/OperationsShell';
export default function Reviews(){return <OperationsShell title="Review exact bytes." description="Inspect source, instructions, supporting assets, license and capability changes. Only an authorized human session can record approval."><ManagementGate>{session=><PrivateWorkspace view="reviews" session={session}/>}</ManagementGate></OperationsShell>;}
