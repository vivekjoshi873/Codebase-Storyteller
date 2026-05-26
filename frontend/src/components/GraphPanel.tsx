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
import type { D3Link, GraphNode, TooltipState } from "@/types";

const NODE_FILL = "#1A1A1A";
const NODE_STROKE = "#444444";
const NODE_HOVER_FILL = "#2A2A2A";
const NODE_HOVER_STROKE = "#888888";
const SELECTED_FILL = "#E8FF8B";
const ACTIVE_FILL = "#E8FF8B";
const LABEL_COLOR = "#444444";
const LABEL_HOVER_COLOR = "#888888";
const LABEL_ACTIVE_COLOR = "#E8FF8B";
const LINK_COLOR = "#222222";
const LARGE_GRAPH_LABEL_LIMIT = 300;

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode>;

const GraphPanel = (): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphData = useStore((s) => s.graphData);
  const activeNodes = useStore((s) => s.activeNodes);
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const entranceDoneRef = useRef<boolean>(false);
  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, visible: false, label: "", path: "" });

  const totalNodes = graphData?.nodes?.length || 0;
  const totalEdges = graphData?.edges?.length || 0;

  useEffect((): (() => void) | void => {
    if (!svgRef.current || !graphData.nodes.length) return;

    entranceDoneRef.current = false;
    const svg: Selection<SVGSVGElement, unknown, null, undefined> = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 640;
    const height = svgRef.current.clientHeight || 480;

    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const nodes: SimNode[] = graphData.nodes.map((n) => ({ ...n }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = graphData.edges
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e): D3Link => ({ source: e.from, target: e.to }));

    const showLabels = nodes.length <= LARGE_GRAPH_LABEL_LIMIT;
    const radius = nodes.length > 1000 ? 3.5 : 5;

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d: SimNode) => d.id)
          .distance(nodes.length > 1000 ? 42 : 80)
          .strength(0.3),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(nodes.length > 1000 ? -18 : -180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius(radius + 8));

    const linkGroup = svg.append("g").attr("class", "links");
    const link: Selection<SVGLineElement, SimLink, SVGGElement, unknown> = linkGroup
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", LINK_COLOR)
      .attr("stroke-opacity", 1)
      .attr("stroke-width", 1);

    const nodeGroup = svg.append("g").attr("class", "nodes");
    const node: Selection<SVGCircleElement, SimNode, SVGGElement, unknown> = nodeGroup
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", radius)
      .attr("fill", NODE_FILL)
      .attr("stroke", NODE_STROKE)
      .attr("stroke-width", 1)
      .attr("data-node-id", (d: SimNode) => d.id)
      .style("cursor", "pointer");

    const labelGroup = svg.append("g").attr("class", "labels");
    let label: Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null = null;
    if (showLabels) {
      label = labelGroup
        .selectAll<SVGTextElement, SimNode>("text")
        .data(nodes)
        .join("text")
        .text((d: SimNode) => d.label)
        .attr("font-size", 9)
        .attr("font-family", "JetBrains Mono, monospace")
        .attr("fill", LABEL_COLOR)
        .attr("text-anchor", "middle")
        .attr("dy", -(radius + 5))
        .attr("data-label-id", (d: SimNode) => d.id)
        .style("pointer-events", "none")
        .style("user-select", "none");
    }

    node
      .on("mouseover", function (event: MouseEvent, d: SimNode): void {
        d3.select<SVGCircleElement, SimNode>(this)
          .transition()
          .duration(150)
          .attr("r", 8)
          .attr("fill", NODE_HOVER_FILL)
          .attr("stroke", NODE_HOVER_STROKE);

        d3.select(svgRef.current)
          .selectAll<SVGTextElement, SimNode>(`text[data-label-id="${CSS.escape(d.id)}"]`)
          .attr("fill", LABEL_HOVER_COLOR);

        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip({ visible: true, x: mx, y: my, label: d.label || d.id.split("/").pop() || d.id, path: d.id });
      })
      .on("mousemove", function (event: MouseEvent): void {
        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip((prev) => ({ ...prev, x: mx, y: my }));
      })
      .on("mouseout", function (_event: MouseEvent, d: SimNode): void {
        const isSelected = selectedFile === d.id;
        const isActive = activeNodes.includes(d.id);
        d3.select<SVGCircleElement, SimNode>(this)
          .transition()
          .duration(150)
          .attr("r", isSelected ? 7 : isActive ? 8 : radius)
          .attr("fill", isSelected || isActive ? SELECTED_FILL : NODE_FILL)
          .attr("stroke", isSelected || isActive ? SELECTED_FILL : NODE_STROKE);

        d3.select(svgRef.current)
          .selectAll<SVGTextElement, SimNode>(`text[data-label-id="${CSS.escape(d.id)}"]`)
          .attr("fill", isSelected || isActive ? LABEL_ACTIVE_COLOR : LABEL_COLOR);
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    let didDrag = false;
    const drag: DragBehavior<SVGCircleElement, SimNode, SimNode | d3.SubjectPosition> = d3
      .drag<SVGCircleElement, SimNode>()
      .on("start", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, d: SimNode): void => {
        didDrag = false;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x ?? 0;
        d.fy = d.y ?? 0;
      })
      .on("drag", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, d: SimNode): void => {
        didDrag = true;
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, d: SimNode): void => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        if (!didDrag) setSelectedFile(d.id);
      });
    node.call(drag);

    node
      .style("opacity", 0)
      .attr("r", 0)
      .transition()
      .delay((_d: SimNode, i: number): number => i * 4)
      .duration(400)
      .style("opacity", 1)
      .attr("r", radius)
      .on("end", function (): void {
        entranceDoneRef.current = true;
      });

    simulation.on("tick", (): void => {
      link
        .attr("x1", (d: SimLink) => ((d.source as SimNode).x ?? 0))
        .attr("y1", (d: SimLink) => ((d.source as SimNode).y ?? 0))
        .attr("x2", (d: SimLink) => ((d.target as SimNode).x ?? 0))
        .attr("y2", (d: SimLink) => ((d.target as SimNode).y ?? 0));

      node.attr("cx", (d: SimNode) => d.x ?? 0).attr("cy", (d: SimNode) => d.y ?? 0);
      if (label) label.attr("x", (d: SimNode) => d.x ?? 0).attr("y", (d: SimNode) => d.y ?? 0);
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

    return (): void => { simulation.stop(); };
  }, [graphData, activeNodes, selectedFile, setSelectedFile]);

  useEffect((): void => {
    if (!svgRef.current || !entranceDoneRef.current) return;
    const svg = d3.select(svgRef.current);

    svg
      .selectAll<SVGCircleElement, SimNode>("circle[data-node-id]")
      .transition()
      .duration(300)
      .attr("fill", (d: SimNode) => (selectedFile === d.id || activeNodes.includes(d.id) ? ACTIVE_FILL : NODE_FILL))
      .attr("stroke", (d: SimNode) => (selectedFile === d.id || activeNodes.includes(d.id) ? ACTIVE_FILL : NODE_STROKE))
      .attr("r", (d: SimNode) => {
        if (selectedFile === d.id) return 7;
        if (activeNodes.includes(d.id)) return 8;
        return 5;
      })
      .attr("filter", (d: SimNode) => (activeNodes.includes(d.id) ? "url(#glow)" : null));

    svg
      .selectAll<SVGTextElement, SimNode>("text[data-label-id]")
      .transition()
      .duration(300)
      .attr("fill", (d: SimNode) => (selectedFile === d.id || activeNodes.includes(d.id) ? LABEL_ACTIVE_COLOR : LABEL_COLOR));
  }, [activeNodes, selectedFile]);

  return (
    <div className="relative w-full h-full bg-canvas overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 h-10 border-b border-border bg-canvas">
        <span className="text-label text-ink-muted tracking-widest uppercase">DEPENDENCY GRAPH</span>
        <span className="text-label text-ink-muted tracking-widest uppercase">{totalNodes} FILES · {totalEdges} IMPORTS</span>
      </div>

      <svg ref={svgRef} width="100%" height="100%" />

      <div
        className="absolute pointer-events-none z-20 bg-canvas border border-border px-3 py-2"
        style={{ left: tooltip.x + 14, top: tooltip.y - 10, opacity: tooltip.visible ? 1 : 0 }}
      >
        <div className="font-mono text-xs text-ink-primary">{tooltip.label}</div>
        <div className="font-mono text-[10px] text-ink-muted mt-0.5">{tooltip.path}</div>
      </div>

      {!!totalNodes && (
        <div className="absolute bottom-4 left-5 z-10">
          <div className="font-mono text-5xl font-bold text-ink-primary leading-none mb-1">{totalNodes}</div>
          <div className="text-label text-ink-muted tracking-widest uppercase">FILES ANALYSED</div>
        </div>
      )}
    </div>
  );
};

export default GraphPanel;



