import { useEffect, useRef, useState, type JSX } from "react";
import * as d3 from "d3";
import type {
  D3DragEvent,
  D3ZoomEvent,
  DragBehavior,
  Selection,
  SimulationLinkDatum,
  SimulationNodeDatum,
  ZoomBehavior,
} from "d3";
import { useStore } from "../store";
import type { D3Link, GraphNode } from "@/types";

const GRAPH_BG = "#0A0A0F";
const NODE_FILL = "#26263A";
const NODE_STROKE = "rgba(255,255,255,0.12)";
const NODE_HOVER_FILL = "#3A3A50";
const NODE_HOVER_STROKE = "rgba(255,255,255,0.22)";
const SELECTED_FILL = "#7C7CFA";
const ACTIVE_FILL = "#E8A838";
const LABEL_COLOR = "rgba(155,155,168,0.55)";
const LABEL_SELECTED_COLOR = "#7C7CFA";
const LABEL_ACTIVE_COLOR = "#E8A838";
const LINK_COLOR = "rgba(255,255,255,0.05)";
const LINK_SELECTED_COLOR = "rgba(124,124,250,0.25)";
const LARGE_GRAPH_LABEL_LIMIT = 300;
const ACTIVE_CLASS_TIMEOUT_MS = 4000;

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode>;
type TooltipViewState = {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  path: string;
  imports: number;
};

const getLinkNodeId = (node: string | number | SimNode): string => {
  if (typeof node === "object") return node.id;
  return String(node);
};

const GraphPanel = (): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphData = useStore((s) => s.graphData);
  const activeNodes = useStore((s) => s.activeNodes);
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const entranceDoneRef = useRef<boolean>(false);
  const selectedFileRef = useRef<string | null>(selectedFile);
  const activeNodesRef = useRef<string[]>(activeNodes);
  const [tooltip, setTooltip] = useState<TooltipViewState>({
    x: 0,
    y: 0,
    visible: false,
    label: "",
    path: "",
    imports: 0,
  });

  const totalNodes = graphData.nodes.length;
  const totalEdges = graphData.edges.length;

  useEffect((): void => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  useEffect((): void => {
    activeNodesRef.current = activeNodes;
  }, [activeNodes]);

  useEffect((): (() => void) | void => {
    if (!svgRef.current || !graphData.nodes.length) return;

    entranceDoneRef.current = false;
    const svg: Selection<SVGSVGElement, unknown, null, undefined> = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const defs = svg.append("defs");
    const radialGradient = defs.append("radialGradient").attr("id", "graphBg").attr("cx", "50%").attr("cy", "50%").attr("r", "45%");
    radialGradient.append("stop").attr("offset", "0%").attr("stop-color", "#1F1F28").attr("stop-opacity", "0.6");
    radialGradient.append("stop").attr("offset", "100%").attr("stop-color", GRAPH_BG).attr("stop-opacity", "0");

    const glow = defs.append("filter").attr("id", "nodeGlow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    const glowMerge = glow.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "blur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const pulseGlow = defs.append("filter").attr("id", "nodePulseGlow").attr("x", "-80%").attr("y", "-80%").attr("width", "360%").attr("height", "360%");
    pulseGlow.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "blur");
    const pulseMerge = pulseGlow.append("feMerge");
    pulseMerge.append("feMergeNode").attr("in", "blur");
    pulseMerge.append("feMergeNode").attr("in", "SourceGraphic");

    svg.append("rect").attr("width", width).attr("height", height).attr("fill", GRAPH_BG);
    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#graphBg)");

    const nodes: SimNode[] = graphData.nodes.map((node) => ({ ...node }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links: SimLink[] = graphData.edges
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge): D3Link => ({ source: edge.from, target: edge.to }));

    const importCounts = new Map<string, number>();
    graphData.edges.forEach((edge) => {
      importCounts.set(edge.from, (importCounts.get(edge.from) ?? 0) + 1);
    });

    const showLabels = nodes.length <= LARGE_GRAPH_LABEL_LIMIT;
    const radius = nodes.length > 1000 ? 3.5 : 5;

    const linkGroup = svg.append("g").attr("class", "links");
    const nodeGroup = svg.append("g").attr("class", "nodes");
    const labelGroup = svg.append("g").attr("class", "labels");

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((node: SimNode) => node.id)
          .distance(nodes.length > 1000 ? 42 : 80)
          .strength(0.3),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(nodes.length > 1000 ? -18 : -180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius(radius + 8));

    const link: Selection<SVGLineElement, SimLink, SVGGElement, unknown> = linkGroup
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", LINK_COLOR)
      .attr("stroke-opacity", 1)
      .attr("stroke-width", 1)
      .attr("data-source-id", (item: SimLink) => getLinkNodeId(item.source as string | number | SimNode))
      .attr("data-target-id", (item: SimLink) => getLinkNodeId(item.target as string | number | SimNode));

    const node: Selection<SVGCircleElement, SimNode, SVGGElement, unknown> = nodeGroup
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", radius)
      .attr("fill", NODE_FILL)
      .attr("stroke", NODE_STROKE)
      .attr("stroke-width", 1.5)
      .attr("data-node-id", (item: SimNode) => item.id)
      .style("cursor", "pointer");

    let label: Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null = null;
    if (showLabels) {
      label = labelGroup
        .selectAll<SVGTextElement, SimNode>("text")
        .data(nodes)
        .join("text")
        .text((item: SimNode) => item.label)
        .attr("font-size", 9)
        .attr("font-family", "JetBrains Mono, monospace")
        .attr("fill", LABEL_COLOR)
        .attr("text-anchor", "middle")
        .attr("dy", -10)
        .attr("data-label-id", (item: SimNode) => item.id)
        .style("pointer-events", "none")
        .style("user-select", "none");
    }

    const updateConnectedLinks = (nodeId: string, highlighted: boolean): void => {
      link
        .transition()
        .duration(120)
        .attr("stroke", (item: SimLink) => {
          const sourceId = getLinkNodeId(item.source as string | number | SimNode);
          const targetId = getLinkNodeId(item.target as string | number | SimNode);
          if (selectedFileRef.current && (sourceId === selectedFileRef.current || targetId === selectedFileRef.current)) return LINK_SELECTED_COLOR;
          if (highlighted && (sourceId === nodeId || targetId === nodeId)) return "rgba(255,255,255,0.18)";
          return LINK_COLOR;
        })
        .attr("stroke-width", (item: SimLink) => {
          const sourceId = getLinkNodeId(item.source as string | number | SimNode);
          const targetId = getLinkNodeId(item.target as string | number | SimNode);
          return selectedFileRef.current && (sourceId === selectedFileRef.current || targetId === selectedFileRef.current) ? 1.5 : 1;
        });
    };

    node
      .on("mouseover", function (event: MouseEvent, item: SimNode): void {
        d3.select<SVGCircleElement, SimNode>(this)
          .transition()
          .duration(120)
          .attr("r", 7)
          .attr("fill", NODE_HOVER_FILL)
          .attr("stroke", NODE_HOVER_STROKE);

        updateConnectedLinks(item.id, true);

        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip({
          visible: true,
          x: mx,
          y: my,
          label: item.label || item.id.split("/").pop() || item.id,
          path: item.id,
          imports: importCounts.get(item.id) ?? 0,
        });
      })
      .on("mousemove", function (event: MouseEvent): void {
        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip((prev) => ({ ...prev, x: mx, y: my }));
      })
      .on("mouseout", function (_event: MouseEvent, item: SimNode): void {
        const isSelected = selectedFileRef.current === item.id;
        const isActive = activeNodesRef.current.includes(item.id);

        d3.select<SVGCircleElement, SimNode>(this)
          .transition()
          .duration(120)
          .attr("r", isSelected ? 7 : isActive ? 8 : radius)
          .attr("fill", isActive ? ACTIVE_FILL : isSelected ? SELECTED_FILL : NODE_FILL)
          .attr("stroke", isActive ? ACTIVE_FILL : isSelected ? SELECTED_FILL : NODE_STROKE)
          .attr("filter", isActive ? "url(#nodePulseGlow)" : isSelected ? "url(#nodeGlow)" : null);

        d3.select(svgRef.current)
          .selectAll<SVGTextElement, SimNode>(`text[data-label-id="${CSS.escape(item.id)}"]`)
          .attr("fill", isActive ? LABEL_ACTIVE_COLOR : isSelected ? LABEL_SELECTED_COLOR : LABEL_COLOR);

        updateConnectedLinks(item.id, false);
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    let didDrag = false;
    const drag: DragBehavior<SVGCircleElement, SimNode, SimNode | d3.SubjectPosition> = d3
      .drag<SVGCircleElement, SimNode>()
      .on("start", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, item: SimNode): void => {
        didDrag = false;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        item.fx = item.x ?? 0;
        item.fy = item.y ?? 0;
      })
      .on("drag", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, item: SimNode): void => {
        didDrag = true;
        item.fx = event.x;
        item.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, item: SimNode): void => {
        if (!event.active) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
        if (!didDrag) setSelectedFile(item.id);
      });
    node.call(drag);

    node
      .style("opacity", 0)
      .attr("r", 0)
      .transition()
      .delay((_item: SimNode, index: number): number => index * 4)
      .duration(400)
      .style("opacity", 1)
      .attr("r", radius)
      .on("end", function (): void {
        entranceDoneRef.current = true;
      });

    simulation.on("tick", (): void => {
      link
        .attr("x1", (item: SimLink) => ((item.source as SimNode).x ?? 0))
        .attr("y1", (item: SimLink) => ((item.source as SimNode).y ?? 0))
        .attr("x2", (item: SimLink) => ((item.target as SimNode).x ?? 0))
        .attr("y2", (item: SimLink) => ((item.target as SimNode).y ?? 0));

      node.attr("cx", (item: SimNode) => item.x ?? 0).attr("cy", (item: SimNode) => item.y ?? 0);
      if (label) {
        label.attr("x", (item: SimNode) => item.x ?? 0).attr("y", (item: SimNode) => item.y ?? 0);
      }
    });

    const zoom: ZoomBehavior<SVGSVGElement, unknown> = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>): void => {
        linkGroup.attr("transform", event.transform.toString());
        nodeGroup.attr("transform", event.transform.toString());
        labelGroup.attr("transform", event.transform.toString());
      });
    svg.call(zoom);

    return (): void => {
      simulation.stop();
    };
  }, [graphData, setSelectedFile]);

  useEffect((): (() => void) | void => {
    if (!svgRef.current || !entranceDoneRef.current) return;
    const svg = d3.select(svgRef.current);

    svg
      .selectAll<SVGCircleElement, SimNode>("circle[data-node-id]")
      .classed("node-pulse-active", (item: SimNode) => activeNodes.includes(item.id))
      .transition()
      .duration(120)
      .attr("fill", (item: SimNode) => (activeNodes.includes(item.id) ? ACTIVE_FILL : selectedFile === item.id ? SELECTED_FILL : NODE_FILL))
      .attr("stroke", (item: SimNode) => (activeNodes.includes(item.id) ? ACTIVE_FILL : selectedFile === item.id ? SELECTED_FILL : NODE_STROKE))
      .attr("r", (item: SimNode) => {
        if (activeNodes.includes(item.id)) return 8;
        if (selectedFile === item.id) return 7;
        return 5;
      })
      .attr("filter", (item: SimNode) => (activeNodes.includes(item.id) ? "url(#nodePulseGlow)" : selectedFile === item.id ? "url(#nodeGlow)" : null));

    svg
      .selectAll<SVGTextElement, SimNode>("text[data-label-id]")
      .transition()
      .duration(120)
      .attr("fill", (item: SimNode) => (activeNodes.includes(item.id) ? LABEL_ACTIVE_COLOR : selectedFile === item.id ? LABEL_SELECTED_COLOR : LABEL_COLOR));

    svg
      .selectAll<SVGLineElement, SimLink>("line")
      .transition()
      .duration(120)
      .attr("stroke", (item: SimLink) => {
        const sourceId = getLinkNodeId(item.source as string | number | SimNode);
        const targetId = getLinkNodeId(item.target as string | number | SimNode);
        return selectedFile && (sourceId === selectedFile || targetId === selectedFile) ? LINK_SELECTED_COLOR : LINK_COLOR;
      })
      .attr("stroke-width", (item: SimLink) => {
        const sourceId = getLinkNodeId(item.source as string | number | SimNode);
        const targetId = getLinkNodeId(item.target as string | number | SimNode);
        return selectedFile && (sourceId === selectedFile || targetId === selectedFile) ? 1.5 : 1;
      });

    if (activeNodes.length === 0) return;
    const timeout = window.setTimeout((): void => {
      const currentSvg = d3.select(svgRef.current);
      currentSvg.selectAll<SVGCircleElement, SimNode>("circle[data-node-id]").classed("node-pulse-active", false);
    }, ACTIVE_CLASS_TIMEOUT_MS);

    return (): void => window.clearTimeout(timeout);
  }, [activeNodes, selectedFile]);

  return (
    <div className="relative w-full h-full bg-base overflow-hidden">
      <div className="panel-header absolute top-0 left-0 right-0 z-10">
        <span className="eyebrow">DEPENDENCY GRAPH</span>
        <span className="mono-data text-ink-muted text-[11px]">{totalNodes} FILES Â· {totalEdges} IMPORTS</span>
      </div>

      <svg ref={svgRef} width="100%" height="100%" />

      <div
        className="absolute pointer-events-none z-30 shadow-float rounded-lg border border-line bg-float px-3 py-2 min-w-[160px] transition-opacity duration-100"
        style={{ left: tooltip.x + 14, top: tooltip.y - 8, opacity: tooltip.visible ? 1 : 0 }}
      >
        <div className="text-sm font-medium text-ink-primary font-mono">{tooltip.label}</div>
        <div className="text-[11px] text-ink-muted mono-data mt-0.5 truncate max-w-[200px]">{tooltip.path}</div>
        <div className="my-2 border-t border-line" />
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-ink-muted">Imports</span>
          <span className="text-[10px] mono-data text-ink-secondary">{tooltip.imports} imports</span>
        </div>
      </div>

      {!!totalNodes && (
        <div className="absolute bottom-5 left-5 z-10">
          <div className="font-mono text-[52px] font-bold text-ink-primary leading-none tracking-[-0.04em]">{totalNodes}</div>
          <div className="eyebrow mt-1">FILES ANALYSED</div>
        </div>
      )}
    </div>
  );
};

export default GraphPanel;
