import Link from "next/link";
import type { Layer, Tab } from "@corbel/config";
import { AgentGuard } from "./AgentGuard";
import { AgentHub } from "./AgentHub";
import { MandateVerdict } from "./MandateVerdict";
import { ExitSplit } from "./ExitSplit";
import { WhaleRadar } from "./WhaleRadar";
import { AccountDashboard } from "./AccountDashboard";
import { TrustCheck } from "./TrustCheck";
import { LoanCalc } from "./LoanCalc";
import { Radar } from "./Radar";
import { TrustApi } from "./TrustApi";
import { Quote } from "./Quote";
import { LaunchAnalytics } from "./LaunchAnalytics";
import { MandateLab } from "./MandateLab";
import { StockDesk } from "./StockDesk";
import { AccountPanel } from "./AccountPanel";
import { DecisionLog } from "./DecisionLog";
import { Terminal } from "./Terminal";
import { StockMarket } from "./StockMarket";
import { EarnPools } from "./EarnPools";
import { WeekendGap } from "./WeekendGap";
import { LimitDelay, MandateBuilder, OrderPlanner } from "./Planners";
import { AlphaBoard } from "./AlphaBoard";
import { EarnGrid } from "./EarnGrid";
import { Transparency } from "./Transparency";
import { PadBoard } from "./PadBoard";
import { CreatorDossier } from "./CreatorDossier";
import { Practice } from "./Practice";
import { AgentLearn } from "./AgentLearn";
import { StrategyLeague } from "./StrategyLeague";
import { SellMany } from "./SellMany";
import { LaunchBrief } from "./LaunchBrief";
import { LiveMandate } from "./LiveMandate";
import { AgentKey } from "./AgentKey";
import { LaunchOutcomes } from "./LaunchOutcomes";
import { BotVolume } from "./BotVolume";
import { PropChallenge } from "./PropChallenge";
import { OrdersDesk } from "./OrdersDesk";
import { AgentWallet } from "./AgentWallet";
import { ModelConsensus } from "./ModelConsensus";
import {
  AgentLimits,
  Alerts,
  ContractRegister,
  FillerDesk,
  Flow,
  LaunchDashboard,
  OrderTypes,
  PropDesk,
  RiskMatrix,
  ShieldRules,
  Strategies,
} from "./Specs";

export function TabWidget({ kind, layer }: { kind: NonNullable<Tab["widget"]>; layer: Layer }) {
  switch (kind) {
    case "terminal":
      return <Terminal />;
    case "stock-market":
      return <StockMarket />;
    case "earn-pools":
      return (
        <div className="space-y-6">
          <EarnGrid />
          <EarnPools />
        </div>
      );
    case "steps":
      return <Flow layer={layer} />;
    case "risk-matrix":
      return <RiskMatrix layer={layer} />;
    case "contracts":
      return layer.id === "account" ? <Transparency /> : <ContractRegister layer={layer} />;
    case "order-types":
      return (
        <div className="space-y-6">
          <OrdersDesk />
          <OrderPlanner />
          <OrderTypes />
        </div>
      );
    case "filler-desk":
      return <FillerDesk />;
    case "agent-limits":
      return (
        // the two short panels side by side, the long ones full width under them: stacked in one column they left the
        // right half empty below the timeline
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-stretch">
            <AgentLimits />
            <LimitDelay />
          </div>
          <AgentKey />
          <AgentWallet />
          <LiveMandate />
        </div>
      );
    case "strategies":
      return (
        <div className="space-y-6">
          <MandateBuilder />
          <Strategies />
        </div>
      );
    case "prop-desk":
      // the evaluation runs today on the paper account; funded seats (the terms below) come after the desk opens
      return (
        <div className="space-y-6">
          <PropChallenge />
          <PropDesk />
        </div>
      );
    case "shield-rules":
      return <ShieldRules />;
    case "launch-dashboard":
      return <LaunchDashboard layer={layer} />;
    case "alerts":
      return <Alerts />;
    case "creator-dossier":
      return <CreatorDossier />;
    case "sell-many":
      return <SellMany />;
    case "practice":
      return <Practice />;
    case "agent-learn":
      return <AgentLearn />;
    case "strategy-league":
      return <StrategyLeague />;
    case "empty-balance":
      return (
        <div className="space-y-6">
          <AccountDashboard />
          <AccountPanel />
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-line px-5 py-3.5">
            <span className="rounded-full border border-line px-2 font-medium text-[12px] uppercase tracking-[0.08em] text-muted">soon</span>
            <p className="min-w-0 flex-1 text-[13px] text-muted">
              <span className="text-text">Corbel One vault.</span> One USDG balance that earns in a lending vault until you swap; it shows here once live.
            </p>
            <Link href="/app/account/pools" className="text-[13px] text-ui underline decoration-ui/30 underline-offset-4 hover:decoration-ui">
              Pool fees today →
            </Link>
          </div>
        </div>
      );
    case "trust-check":
      return (
        <div className="space-y-6">
          <TrustCheck />
          <ModelConsensus />
        </div>
      );
    case "trust-radar":
      return (
        <div className="space-y-6">
          <LaunchBrief />
          <AlphaBoard />
          <PadBoard />
          <LaunchOutcomes />
          <Radar />
        </div>
      );
    case "trade-quote":
      return <Quote />;
    case "exit-split":
      return <ExitSplit />;
    case "whale-radar":
      return <WhaleRadar />;
    case "launch-analytics":
      return (
        <div className="space-y-6">
          <LaunchAnalytics />
          <BotVolume />
          <LaunchBrief verdict={false} />
        </div>
      );
    case "mandate-lab":
      return (
        <div className="space-y-4">
          <MandateVerdict page="break" />
          <MandateLab />
        </div>
      );
    case "agent-guard":
      return <AgentGuard />;
    case "agent-hub":
      return (
        <div className="space-y-4">
          <MandateVerdict page="hub" />
          <AgentHub />
        </div>
      );
    case "trust-api":
      return <TrustApi />;
    case "stock-desk":
      return (
        <div className="mx-auto max-w-[76rem] space-y-6">
          <WeekendGap />
          <StockDesk />
        </div>
      );
    case "loan-calc":
      return <LoanCalc />;
    case "decision-log":
      return (
        <div className="space-y-4">
          <MandateVerdict page="log" />
          <DecisionLog />
        </div>
      );
  }
}
